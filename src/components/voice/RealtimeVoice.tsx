"use client";
import { Phone, PhoneOff } from "lucide-react";
import { useRef, useState } from "react";
import { SoMascot, type VoiceState } from "@/components/brand/SoMascot";
import { Soundwave } from "@/components/brand/Soundwave";
import { Button } from "@/components/ui/primitives";
import { useI18n } from "@/lib/i18n/client";

/**
 * Live speech-to-speech test over WebRTC with the OpenAI Realtime API.
 * The browser receives only a short-lived client secret minted by our server.
 */
export function RealtimeVoice({ employee, hue }: { employee: Record<string, unknown>; hue?: number }) {
  const { t, locale } = useI18n();
  const [state, setState] = useState<VoiceState>("idle");
  const [status, setStatus] = useState<string | null>(null);
  const pc = useRef<RTCPeerConnection | null>(null);
  const stream = useRef<MediaStream | null>(null);

  async function start() {
    setStatus(null);
    try {
      const res = await fetch("/api/ai/realtime-session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ employee }) });
      const data = await res.json();
      if (!res.ok) {
        setStatus(data?.error?.code === "provider_not_configured"
          ? (locale === "ar" ? "الصوت المباشر غير مُعد: أضف OPENAI_API_KEY على الخادم." : "Live voice isn't configured: add OPENAI_API_KEY on the server.")
          : data?.error?.message ?? "Failed");
        return;
      }
      const conn = new RTCPeerConnection();
      pc.current = conn;
      const audio = document.createElement("audio");
      audio.autoplay = true;
      conn.ontrack = (e) => { audio.srcObject = e.streams[0]; };
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      conn.addTrack(stream.current.getTracks()[0]);
      const dc = conn.createDataChannel("oai-events");
      dc.onmessage = (e) => {
        const ev = JSON.parse(e.data) as { type: string; name?: string };
        if (ev.type === "input_audio_buffer.speech_started") setState("listening");
        else if (ev.type === "input_audio_buffer.speech_stopped" || ev.type === "response.created") setState("thinking");
        else if (ev.type === "output_audio_buffer.started" || ev.type === "response.audio.delta" || ev.type === "response.output_audio.delta") setState("speaking");
        else if (ev.type === "response.function_call_arguments.done" && ev.name === "transfer_to_human") setState("transfer");
        else if (ev.type === "output_audio_buffer.stopped" || ev.type === "response.done") setState((s) => (s === "transfer" ? s : "completed"));
      };
      const offer = await conn.createOffer();
      await conn.setLocalDescription(offer);
      const sdp = await fetch("https://api.openai.com/v1/realtime/calls", { // GA WebRTC endpoint
        method: "POST",
        body: offer.sdp,
        headers: { Authorization: `Bearer ${data.client_secret}`, "Content-Type": "application/sdp" },
      });
      if (!sdp.ok) throw new Error(`Realtime connect failed (${sdp.status})`);
      await conn.setRemoteDescription({ type: "answer", sdp: await sdp.text() });
      setState("listening");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Microphone or network error");
      stop();
    }
  }

  function stop() {
    pc.current?.close();
    stream.current?.getTracks().forEach((tr) => tr.stop());
    pc.current = null;
    setState((s) => (s === "idle" ? s : "completed"));
  }

  const live = !!pc.current;
  return (
    <div className="glass flex flex-col items-center gap-4 p-6 text-center">
      <SoMascot state={state} size={150} hue={hue} />
      <p className="text-sm font-semibold">{t.demo.states[state]}</p>
      <Soundwave bars={36} active={state === "speaking" || state === "listening"} />
      {live ? (
        <Button variant="danger" onClick={stop}><PhoneOff className="h-4 w-4" />{locale === "ar" ? "إنهاء" : "End test call"}</Button>
      ) : (
        <Button onClick={start}><Phone className="h-4 w-4" />{locale === "ar" ? "اختبار صوتي مباشر" : "Start live voice test"}</Button>
      )}
      {status && <p className="max-w-xs text-xs text-amber-200">{status}</p>}
      <p className="text-[11px] text-muted">{locale === "ar" ? "يستخدم الميكروفون عبر المتصفح. لا يتم إجراء مكالمة هاتفية." : "Uses your browser microphone. No phone call is placed."}</p>
    </div>
  );
}
