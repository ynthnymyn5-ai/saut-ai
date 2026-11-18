/**
 * Live voice conversation with Sanad over WebRTC (OpenAI Realtime).
 *
 * The server mints a short-lived client secret; the browser streams the mic to
 * the realtime model and plays its voice. When the model calls `ask_sanad`,
 * the request goes to /api/realtime/ask (a full Sanad turn: agents, memory,
 * approvals) and the answer is handed back for the model to speak.
 * Mic and voice levels drive the orb through `audioBus`.
 */
import type { ChatResponse } from "@shared/types";
import { audioBus } from "./audioBus";

export type LiveState = "connecting" | "listening" | "thinking" | "speaking";

export interface LiveHandlers {
  onState: (s: LiveState) => void;
  onUserText: (text: string) => void;
  onAssistantDelta: (textSoFar: string) => void;
  onAssistantDone: (text: string) => void;
  /** a Sanad turn finished (actions, approvals, delegations) */
  onTurn: (res: ChatResponse) => void;
  onError: (message: string) => void;
  onEnd: () => void;
}

const levelOf = (an: AnalyserNode, buf: Uint8Array<ArrayBuffer>) => {
  an.getByteTimeDomainData(buf);
  let sum = 0;
  for (let i = 0; i < buf.length; i++) {
    const v = (buf[i] - 128) / 128;
    sum += v * v;
  }
  return Math.min(1, Math.sqrt(sum / buf.length) * 4.5);
};

export class LiveSession {
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private mic: MediaStream | null = null;
  private audio = new Audio();
  private ctx: AudioContext | null = null;
  private raf = 0;
  private conversationId: number | null = null;
  private assistantText = "";
  private ended = false;

  constructor(private h: LiveHandlers, conversationId: number | null) {
    this.conversationId = conversationId;
    this.audio.autoplay = true;
  }

  async start() {
    this.h.onState("connecting");
    try {
      // 1. Microphone first, so the permission prompt comes from the click
      this.mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });

      // 2. Short-lived secret from our server
      const r = await fetch("/api/realtime/session", { method: "POST" });
      const secret = await r.json();
      if (!r.ok) throw new Error(secret.message ?? "Live voice is not configured.");

      // 3. WebRTC: mic up, Sanad's voice down, events on a data channel
      const pc = (this.pc = new RTCPeerConnection());
      pc.ontrack = (e) => {
        this.audio.srcObject = e.streams[0];
        this.meter(e.streams[0]);
      };
      this.mic.getTracks().forEach((t) => pc.addTrack(t, this.mic!));
      const dc = (this.dc = pc.createDataChannel("oai-events"));
      dc.onmessage = (e) => this.onEvent(JSON.parse(e.data));
      dc.onopen = () => this.h.onState("listening");
      pc.onconnectionstatechange = () => ["failed", "closed", "disconnected"].includes(pc.connectionState) && this.stop();

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const sdp = await fetch("https://api.openai.com/v1/realtime/calls", {
        method: "POST",
        body: offer.sdp,
        headers: { Authorization: `Bearer ${secret.value}`, "Content-Type": "application/sdp" },
      });
      if (!sdp.ok) throw new Error(`Realtime connection failed (${sdp.status})`);
      await pc.setRemoteDescription({ type: "answer", sdp: await sdp.text() });
    } catch (e) {
      const err = e as Error & { name?: string };
      this.h.onError(err.name === "NotAllowedError" ? "denied" : err.message);
      this.stop();
    }
  }

  /** Orb level = the louder of the mic and Sanad's voice. */
  private meter(remote: MediaStream) {
    this.ctx = new AudioContext();
    const mk = (s: MediaStream) => {
      const an = this.ctx!.createAnalyser();
      an.fftSize = 1024;
      this.ctx!.createMediaStreamSource(s).connect(an);
      return an;
    };
    const micAn = this.mic ? mk(this.mic) : null;
    const outAn = mk(remote);
    const buf = new Uint8Array(1024);
    const loop = () => {
      const target = Math.max(micAn ? levelOf(micAn, buf) : 0, levelOf(outAn, buf));
      audioBus.level += (target - audioBus.level) * 0.35;
      this.raf = requestAnimationFrame(loop);
    };
    loop();
  }

  private send(event: unknown) {
    if (this.dc?.readyState === "open") this.dc.send(JSON.stringify(event));
  }

  private async onEvent(ev: { type: string; [k: string]: any }) {
    switch (ev.type) {
      case "input_audio_buffer.speech_started":
        this.h.onState("listening");
        break;
      case "input_audio_buffer.speech_stopped":
        this.h.onState("thinking");
        break;
      case "conversation.item.input_audio_transcription.completed":
        if (ev.transcript?.trim()) this.h.onUserText(ev.transcript.trim());
        break;
      case "response.output_audio_transcript.delta":
        this.assistantText += ev.delta ?? "";
        this.h.onState("speaking");
        this.h.onAssistantDelta(this.assistantText);
        break;
      case "response.output_audio_transcript.done":
        if (this.assistantText.trim()) this.h.onAssistantDone(this.assistantText.trim());
        this.assistantText = "";
        break;
      case "output_audio_buffer.stopped":
      case "response.done":
        this.h.onState("listening");
        break;
      case "response.function_call_arguments.done":
        await this.runTool(ev.call_id, ev.name, ev.arguments);
        break;
      case "error":
        this.h.onError(ev.error?.message ?? "Realtime error");
        break;
    }
  }

  private async runTool(callId: string, name: string, rawArgs: string) {
    this.h.onState("thinking");
    let output: string;
    try {
      const args = JSON.parse(rawArgs || "{}");
      if (name !== "ask_sanad") throw new Error(`Unknown tool ${name}`);
      const r = await fetch("/api/realtime/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request: String(args.request ?? ""), conversationId: this.conversationId }),
      });
      const res = (await r.json()) as ChatResponse;
      if (!r.ok) throw new Error((res as unknown as { message?: string }).message ?? "Sanad failed");
      this.conversationId = res.conversationId;
      this.h.onTurn(res);
      output = JSON.stringify({
        answer: res.reply.slice(0, 3000),
        waiting_for_owner_approval: res.pending.map((p) => p.summary),
      });
    } catch (e) {
      output = JSON.stringify({ error: (e as Error).message });
    }
    this.send({ type: "conversation.item.create", item: { type: "function_call_output", call_id: callId, output } });
    this.send({ type: "response.create" });
  }

  stop() {
    if (this.ended) return;
    this.ended = true;
    cancelAnimationFrame(this.raf);
    audioBus.level = 0;
    this.dc?.close();
    this.pc?.close();
    this.mic?.getTracks().forEach((t) => t.stop());
    this.audio.srcObject = null;
    void this.ctx?.close();
    this.h.onEnd();
  }
}
