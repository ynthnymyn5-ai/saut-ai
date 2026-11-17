/**
 * Voice I/O.
 *
 * Speech-to-text:
 *   - server mode (OPENAI key present): record with MediaRecorder, stop on
 *     release or ~1.4s of silence, upload to /api/voice/transcribe (Whisper)
 *   - browser mode: Web Speech API (SpeechRecognition) with interim results
 * Text-to-speech:
 *   - server mode: /api/voice/speak (OpenAI TTS mp3), analysed for the orb
 *   - browser mode: speechSynthesis with a synthetic level for the orb
 * Wake word: continuous SpeechRecognition listening for "Sanad" / "سند".
 */
import { audioBus, pumpLevel } from "./audioBus";

type SR = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};
const SpeechRecognitionCtor: (new () => SR) | undefined =
  (window as unknown as { SpeechRecognition?: new () => SR }).SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: new () => SR }).webkitSpeechRecognition;

export const browserSTT = Boolean(SpeechRecognitionCtor);
export const canRecord = typeof window !== "undefined" && "MediaRecorder" in window && Boolean(navigator.mediaDevices?.getUserMedia);

let audioCtx: AudioContext | null = null;
const ctx = () => (audioCtx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)());

export interface ListenHandlers {
  onInterim?: (text: string) => void;
  onFinal: (text: string, lang?: string) => void;
  onError: (err: string) => void;
  onEnd?: () => void;
}

export interface ListenSession {
  stop: () => void;
  cancel: () => void;
}

const isArabic = (s: string) => /[؀-ۿ]/.test(s);

/** Start listening. `serverVoice` picks Whisper vs. the browser recogniser. */
export async function listen(serverVoice: boolean, uiLang: "en" | "ar", h: ListenHandlers): Promise<ListenSession> {
  if (serverVoice && canRecord) return listenServer(h);
  if (browserSTT) return listenBrowser(uiLang, h);
  if (canRecord) return listenServer(h);
  h.onError("unsupported");
  return { stop() {}, cancel() {} };
}

async function listenServer(h: ListenHandlers): Promise<ListenSession> {
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  } catch {
    h.onError("denied");
    return { stop() {}, cancel() {} };
  }
  const ac = ctx();
  await ac.resume();
  const src = ac.createMediaStreamSource(stream);
  const analyser = ac.createAnalyser();
  analyser.fftSize = 1024;
  src.connect(analyser);
  const stopPump = pumpLevel(analyser);

  const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find((m) => MediaRecorder.isTypeSupported?.(m)) ?? "";
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  const chunks: Blob[] = [];
  let cancelled = false;
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);

  // Simple voice-activity detection: stop after ~1.4s of silence once speech was heard
  let heard = false;
  let silentSince = 0;
  const startedAt = performance.now();
  const vad = setInterval(() => {
    const now = performance.now();
    if (audioBus.level > 0.12) {
      heard = true;
      silentSince = 0;
    } else if (heard) {
      silentSince ||= now;
      if (now - silentSince > 1400) finish();
    }
    if (now - startedAt > 30_000 || (!heard && now - startedAt > 8000)) finish();
  }, 100);

  const cleanup = () => {
    clearInterval(vad);
    stopPump();
    stream.getTracks().forEach((t) => t.stop());
    src.disconnect();
  };

  rec.onstop = async () => {
    cleanup();
    if (cancelled) return h.onEnd?.();
    const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
    if (blob.size < 1500) {
      h.onEnd?.();
      return;
    }
    try {
      const fd = new FormData();
      fd.append("audio", blob, `speech.${blob.type.includes("mp4") ? "mp4" : "webm"}`);
      const res = await fetch("/api/voice/transcribe", { method: "POST", body: fd });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "transcription failed");
      const { text, language } = await res.json();
      if (text?.trim()) h.onFinal(text.trim(), language);
      else h.onEnd?.();
    } catch (e) {
      h.onError((e as Error).message);
    }
  };

  function finish() {
    if (rec.state === "recording") rec.stop();
  }
  rec.start(250);
  return {
    stop: finish,
    cancel: () => {
      cancelled = true;
      finish();
    },
  };
}

function listenBrowser(uiLang: "en" | "ar", h: ListenHandlers): ListenSession {
  const r = new SpeechRecognitionCtor!();
  r.lang = uiLang === "ar" ? "ar-KW" : "en-US";
  r.continuous = false;
  r.interimResults = true;
  let final = "";
  let cancelled = false;
  // Synthetic level so the orb reacts while the browser recogniser listens
  let raf = 0;
  const wiggle = () => {
    audioBus.level = 0.25 + Math.random() * 0.35;
    raf = window.setTimeout(wiggle, 120);
  };
  wiggle();
  r.onresult = (e) => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const res = e.results[i];
      if (res.isFinal) final += res[0].transcript;
      else interim += res[0].transcript;
    }
    h.onInterim?.(final + interim);
  };
  r.onerror = (e) => {
    clearTimeout(raf);
    audioBus.level = 0;
    if (e.error === "not-allowed") h.onError("denied");
    else if (e.error !== "no-speech" && e.error !== "aborted") h.onError(e.error);
  };
  r.onend = () => {
    clearTimeout(raf);
    audioBus.level = 0;
    if (!cancelled && final.trim()) h.onFinal(final.trim(), isArabic(final) ? "ar" : "en");
    else h.onEnd?.();
  };
  r.start();
  return {
    stop: () => r.stop(),
    cancel: () => {
      cancelled = true;
      r.abort();
    },
  };
}

// ─── Text-to-speech ──────────────────────────────────────────────────────────
let currentAudio: HTMLAudioElement | null = null;
let stopSpeakingPump: (() => void) | null = null;

export function stopSpeaking() {
  currentAudio?.pause();
  currentAudio = null;
  stopSpeakingPump?.();
  stopSpeakingPump = null;
  window.speechSynthesis?.cancel();
  audioBus.level = 0;
}

/** Speak `text`; resolves when playback ends. */
export async function speak(text: string, lang: "en" | "ar", serverVoice: boolean): Promise<void> {
  stopSpeaking();
  if (serverVoice) {
    try {
      const res = await fetch("/api/voice/speak", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, lang }) });
      if (!res.ok) throw new Error("tts failed");
      const url = URL.createObjectURL(await res.blob());
      const audio = new Audio(url);
      currentAudio = audio;
      const ac = ctx();
      await ac.resume();
      const src = ac.createMediaElementSource(audio);
      const analyser = ac.createAnalyser();
      analyser.fftSize = 1024;
      src.connect(analyser);
      analyser.connect(ac.destination);
      stopSpeakingPump = pumpLevel(analyser);
      await new Promise<void>((resolve) => {
        audio.onended = audio.onerror = () => resolve();
        audio.play().catch(() => resolve());
      });
      stopSpeaking();
      URL.revokeObjectURL(url);
      return;
    } catch {
      /* fall through to browser voice */
    }
  }
  if (!("speechSynthesis" in window)) return;
  await new Promise<void>((resolve) => {
    const u = new SpeechSynthesisUtterance(text.replace(/[*_#`>]/g, "").replace(/https?:\/\/\S+/g, ""));
    u.lang = lang === "ar" ? "ar-SA" : "en-US";
    const voices = speechSynthesis.getVoices();
    const v = voices.find((x) => x.lang.startsWith(lang) && /female|samantha|zira|google|hoda|laila|mariam/i.test(x.name)) ?? voices.find((x) => x.lang.startsWith(lang));
    if (v) u.voice = v;
    u.rate = 1.02;
    // Browser TTS can't be analysed — animate a speech-like envelope instead
    let raf = 0;
    const start = performance.now();
    const env = () => {
      const t = (performance.now() - start) / 1000;
      audioBus.level = 0.3 + 0.25 * Math.abs(Math.sin(t * 9)) * (0.6 + 0.4 * Math.sin(t * 2.3));
      raf = requestAnimationFrame(env);
    };
    u.onstart = () => env();
    u.onend = u.onerror = () => {
      cancelAnimationFrame(raf);
      audioBus.level = 0;
      resolve();
    };
    speechSynthesis.speak(u);
  });
}

// ─── Wake word ───────────────────────────────────────────────────────────────
const WAKE = /\b(sanad|sannad|sanat|sinad|sened|hey sanad)\b|سند|ساند/i;

/**
 * Listen continuously for "Sanad". Calls onWake with any words spoken after the
 * wake word in the same breath (e.g. "Sanad, what's on today?").
 * Requires the browser SpeechRecognition API (Chrome, Edge, Safari 17+).
 */
export function startWakeWord(uiLang: "en" | "ar", onWake: (rest: string) => void): (() => void) | null {
  if (!SpeechRecognitionCtor) return null;
  let active = true;
  let r: SR | null = null;
  const boot = () => {
    if (!active) return;
    r = new SpeechRecognitionCtor!();
    r.lang = uiLang === "ar" ? "ar-KW" : "en-US";
    r.continuous = true;
    r.interimResults = false;
    r.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const text = e.results[i][0].transcript;
        const m = text.match(WAKE);
        if (m && e.results[i].isFinal) {
          const rest = text.slice((m.index ?? 0) + m[0].length).replace(/^[\s,.،!؟?]+/, "").trim();
          active = false;
          r?.abort();
          onWake(rest);
          return;
        }
      }
    };
    r.onerror = () => {};
    r.onend = () => active && setTimeout(boot, 400); // keep it alive
    try {
      r.start();
    } catch {
      /* already started */
    }
  };
  boot();
  return () => {
    active = false;
    r?.abort();
  };
}
