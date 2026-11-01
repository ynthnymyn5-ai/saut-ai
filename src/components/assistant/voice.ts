"use client";
/**
 * Browser audio for the assistant:
 *  - BuiltinVoice: plays PCM16/16 kHz through Web Audio and reports the speech level every
 *    frame so the built-in face can move its mouth in sync.
 *  - PhotorealFace: a Simli session (audio → lip-synced photoreal video over WebRTC). The
 *    SDK is loaded only when a session starts, so it costs nothing until the assistant opens.
 *  - Recorder: push-to-talk with automatic stop after ~1.2 s of silence (max 15 s).
 */

export interface Speaker { speak(pcm: Uint8Array, onLevel?: (l: number) => void): Promise<void>; stop(): void; close(): void }

let sharedCtx: AudioContext | null = null;
export function audioContext() {
  if (!sharedCtx) sharedCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  if (sharedCtx.state === "suspended") void sharedCtx.resume();
  return sharedCtx;
}

export class BuiltinVoice implements Speaker {
  private src: AudioBufferSourceNode | null = null;
  private raf = 0;
  async speak(pcm: Uint8Array, onLevel?: (l: number) => void) {
    this.stop();
    const ctx = audioContext();
    const n = Math.floor(pcm.byteLength / 2);
    const view = new DataView(pcm.buffer, pcm.byteOffset, n * 2);
    const buf = ctx.createBuffer(1, n, 16000);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < n; i++) ch[i] = view.getInt16(i * 2, true) / 32768;
    const src = ctx.createBufferSource();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    src.buffer = buf;
    src.connect(analyser).connect(ctx.destination);
    this.src = src;
    const data = new Float32Array(analyser.fftSize);
    const tick = () => {
      analyser.getFloatTimeDomainData(data);
      let s = 0; for (const v of data) s += v * v;
      onLevel?.(Math.min(1, Math.sqrt(s / data.length) * 4));
      this.raf = requestAnimationFrame(tick);
    };
    await new Promise<void>((resolve) => {
      src.onended = () => { cancelAnimationFrame(this.raf); onLevel?.(0); if (this.src === src) this.src = null; resolve(); };
      src.start();
      tick();
    });
  }
  stop() { try { this.src?.stop(); } catch { /* already stopped */ } this.src = null; cancelAnimationFrame(this.raf); }
  close() { this.stop(); }
}

type SimliLike = {
  on(ev: string, cb: (...a: unknown[]) => void): void;
  start(): Promise<void>; stop(): Promise<void>;
  sendAudioData(d: Uint8Array): void; ClearBuffer(): void;
};

export class PhotorealFace implements Speaker {
  private client: SimliLike | null = null;
  private doneSpeaking: (() => void) | null = null;
  ended = false;
  static async start(video: HTMLVideoElement, audio: HTMLAudioElement, onEnd: () => void): Promise<PhotorealFace | { unavailable: string }> {
    const r = await fetch("/api/assistant/face", { method: "POST" });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.session_token) return { unavailable: d?.error?.code ?? (d.demo ? "demo" : "error") };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod: any = await import("simli-client");
    const client = new mod.SimliClient(d.session_token, video, audio, null, mod.LogLevel?.ERROR ?? 2) as SimliLike;
    const face = new PhotorealFace();
    face.client = client;
    client.on("silent", () => { face.doneSpeaking?.(); face.doneSpeaking = null; });
    client.on("stop", () => { face.ended = true; onEnd(); });
    client.on("error", () => { face.ended = true; onEnd(); });
    await client.start(); // resolves on the first video frame
    return face;
  }
  async speak(pcm: Uint8Array) {
    if (!this.client || this.ended) throw new Error("face session ended");
    this.client.ClearBuffer();
    for (let i = 0; i < pcm.byteLength; i += 6000) this.client.sendAudioData(pcm.subarray(i, i + 6000));
    const seconds = pcm.byteLength / 32000; // 16 kHz × 2 bytes
    await new Promise<void>((resolve) => {
      const t = setTimeout(resolve, seconds * 1000 + 1500); // fallback if no "silent" event
      this.doneSpeaking = () => { clearTimeout(t); resolve(); };
    });
  }
  stop() { try { this.client?.ClearBuffer(); } catch { /* not connected */ } this.doneSpeaking?.(); this.doneSpeaking = null; }
  close() { this.stop(); void this.client?.stop().catch(() => {}); this.client = null; this.ended = true; }
}

/** Push-to-talk recorder with simple voice-activity auto-stop. */
export async function recordUtterance(opts: { onLevel?: (l: number) => void; signal: AbortSignal }): Promise<Blob | null> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  const ctx = audioContext();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  ctx.createMediaStreamSource(stream).connect(analyser);
  const mime = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm", "audio/ogg"].find((m) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) ?? "";
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const data = new Float32Array(analyser.fftSize);
  let heard = false, quietSince = 0, raf = 0;
  const started = performance.now();
  return new Promise((resolve) => {
    const finish = () => { cancelAnimationFrame(raf); if (rec.state !== "inactive") rec.stop(); };
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      opts.onLevel?.(0);
      resolve(heard && chunks.length ? new Blob(chunks, { type: rec.mimeType || mime || "audio/webm" }) : null);
    };
    opts.signal.addEventListener("abort", finish, { once: true });
    const tick = () => {
      analyser.getFloatTimeDomainData(data);
      let s = 0; for (const v of data) s += v * v;
      const level = Math.sqrt(s / data.length);
      opts.onLevel?.(Math.min(1, level * 6));
      const now = performance.now();
      if (level > 0.02) { heard = true; quietSince = 0; } else if (heard && !quietSince) quietSince = now;
      if ((heard && quietSince && now - quietSince > 1200) || now - started > 15000 || (!heard && now - started > 6000)) return finish();
      raf = requestAnimationFrame(tick);
    };
    rec.start(250);
    tick();
  });
}
