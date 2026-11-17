/**
 * App-wide state: the current conversation, orb state, live captions,
 * the confirmation queue, voice controls and a `dataVersion` counter that
 * panels watch to refetch after Mira changes something.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { AgentId } from "@shared/agents";
import type { ChatResponse, Lang, PendingActionDTO } from "@shared/types";
import { api } from "./api";
import { useI18n } from "../i18n";
import type { OrbState } from "../voice/audioBus";
import { listen, speak, stopSpeaking, startWakeWord, type ListenSession } from "../voice/voiceEngine";

export interface ThreadMsg {
  id: string;
  role: "user" | "assistant";
  content: string;
  lang?: Lang;
  agent?: AgentId;
  delegations?: AgentId[];
  actions?: { tool: string; summary: string }[];
  pending?: PendingActionDTO[];
}

export interface AppStatus {
  provider: string;
  aiConfigured: boolean;
  /** static demo build running on the in-browser mock server */
  demo?: boolean;
  serverVoice: boolean;
  webSearch: boolean;
  timezone: string;
  briefHour: number;
  currency: string;
  confirmTools: string[];
}

interface Toast {
  id: number;
  text: string;
  tone: "info" | "success" | "error";
}

interface Prefs {
  autoSpeak: boolean;
  wakeWord: boolean;
}

interface MiraCtx {
  status: AppStatus | null;
  user: { id: string; name: string | null; email: string | null; image: string | null } | null;
  authMode: string;
  conversationId: number | null;
  thread: ThreadMsg[];
  orbState: OrbState;
  captions: { user: string; mira: string; miraLang: Lang };
  pending: PendingActionDTO[];
  dataVersion: number;
  lastDelegations: AgentId[];
  prefs: Prefs;
  toasts: Toast[];
  busy: boolean;
  send: (text: string, opts?: { agentId?: AgentId; voice?: boolean; keepThread?: boolean }) => Promise<ChatResponse | null>;
  startVoice: () => void;
  stopVoice: () => void;
  stopTalking: () => void;
  decide: (id: number, approve: boolean) => Promise<void>;
  newConversation: () => void;
  loadConversation: (id: number) => Promise<void>;
  bump: () => void;
  setPref: <K extends keyof Prefs>(k: K, v: Prefs[K]) => void;
  toast: (text: string, tone?: Toast["tone"]) => void;
}

const Ctx = createContext<MiraCtx>(null as unknown as MiraCtx);

const loadPrefs = (): Prefs => {
  try {
    return { autoSpeak: false, wakeWord: false, ...JSON.parse(localStorage.getItem("mira.prefs") ?? "{}") };
  } catch {
    return { autoSpeak: false, wakeWord: false };
  }
};

export function MiraProvider({ children }: { children: ReactNode }) {
  const { lang: uiLang, t } = useI18n();
  const [status, setStatus] = useState<AppStatus | null>(null);
  const [user, setUser] = useState<MiraCtx["user"]>(null);
  const [authMode, setAuthMode] = useState("local");
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [thread, setThread] = useState<ThreadMsg[]>([]);
  const [orbState, setOrbState] = useState<OrbState>("idle");
  const [captions, setCaptions] = useState({ user: "", mira: "", miraLang: uiLang as Lang });
  const [pending, setPending] = useState<PendingActionDTO[]>([]);
  const [dataVersion, setDataVersion] = useState(0);
  const [lastDelegations, setLastDelegations] = useState<AgentId[]>([]);
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [busy, setBusy] = useState(false);
  const listenRef = useRef<ListenSession | null>(null);
  const convRef = useRef<number | null>(null);
  convRef.current = conversationId;

  const toast = useCallback((text: string, tone: Toast["tone"] = "info") => {
    const id = Date.now() + Math.random();
    setToasts((ts) => [...ts, { id, text, tone }]);
    setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), 4500);
  }, []);

  const bump = useCallback(() => setDataVersion((v) => v + 1), []);

  // Bootstrap
  useEffect(() => {
    api.get<{ user: MiraCtx["user"]; mode: string }>("/api/auth/me").then((r) => {
      setAuthMode(r.mode);
      if (!r.user && r.mode === "replit") window.location.href = "/api/login";
      setUser(r.user);
    });
    api.get<AppStatus>("/api/status").then(setStatus).catch(() => {});
    api.get<PendingActionDTO[]>("/api/actions/pending").then(setPending).catch(() => {});
  }, []);

  const setPref = useCallback(<K extends keyof Prefs>(k: K, v: Prefs[K]) => {
    setPrefs((p) => {
      const next = { ...p, [k]: v };
      try {
        localStorage.setItem("mira.prefs", JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const send = useCallback<MiraCtx["send"]>(
    async (text, opts = {}) => {
      const msg = text.trim();
      if (!msg) return null;
      stopSpeaking();
      const panel = Boolean(opts.agentId && opts.agentId !== "chief");
      if (!panel) {
        setThread((th) => [...th, { id: `u${Date.now()}`, role: "user", content: msg }]);
        setCaptions((c) => ({ ...c, user: msg, mira: "" }));
        setOrbState("thinking");
      }
      setBusy(true);
      try {
        const res = await api.post<ChatResponse>("/api/chat", {
          message: msg,
          conversationId: panel ? null : convRef.current,
          agentId: opts.agentId ?? "chief",
        });
        if (!panel) {
          setConversationId(res.conversationId);
          setThread((th) => [...th, { id: `a${res.messageId}`, role: "assistant", content: res.reply, lang: res.lang, agent: res.agent, delegations: res.delegations, actions: res.actions, pending: res.pending }]);
          setCaptions({ user: msg, mira: res.reply, miraLang: res.lang });
          setLastDelegations(res.delegations);
        }
        if (res.pending.length) setPending((p) => [...res.pending, ...p.filter((x) => !res.pending.some((y) => y.id === x.id))]);
        if (res.actions.length || res.pending.length) bump();

        if (!panel && (opts.voice || prefs.autoSpeak) && opts.voice !== false) {
          setOrbState("speaking");
          await speak(res.reply, res.lang, Boolean(status?.serverVoice));
        }
        return res;
      } catch (e) {
        toast((e as Error).message, "error");
        return null;
      } finally {
        setBusy(false);
        if (!panel) setOrbState("idle");
      }
    },
    [bump, prefs.autoSpeak, status?.serverVoice, toast],
  );

  const startVoice = useCallback(async () => {
    stopSpeaking();
    listenRef.current?.cancel();
    setOrbState("listening");
    setCaptions((c) => ({ ...c, user: "", mira: "" }));
    listenRef.current = await listen(Boolean(status?.serverVoice), uiLang, {
      onInterim: (txt) => setCaptions((c) => ({ ...c, user: txt })),
      onFinal: (txt) => {
        listenRef.current = null;
        void send(txt, { voice: true });
      },
      onError: (err) => {
        listenRef.current = null;
        setOrbState("idle");
        toast(err === "denied" ? t.voice.micDenied : err === "unsupported" ? t.voice.unsupported : err, "error");
      },
      onEnd: () => {
        listenRef.current = null;
        setOrbState((s) => (s === "listening" ? "idle" : s));
      },
    });
  }, [send, status?.serverVoice, t.voice, toast, uiLang]);

  const stopVoice = useCallback(() => {
    listenRef.current?.stop();
  }, []);

  const stopTalking = useCallback(() => {
    stopSpeaking();
    listenRef.current?.cancel();
    setOrbState("idle");
  }, []);

  // Wake word runs only while idle
  useEffect(() => {
    if (!prefs.wakeWord || orbState !== "idle") return;
    const stop = startWakeWord(uiLang, (rest) => {
      if (rest.length > 3) void send(rest, { voice: true });
      else void startVoice();
    });
    if (!stop) {
      toast(t.voice.unsupported, "error");
      setPref("wakeWord", false);
    }
    return () => stop?.();
  }, [prefs.wakeWord, orbState, uiLang, send, startVoice, setPref, t.voice.unsupported, toast]);

  const decide = useCallback(
    async (id: number, approve: boolean) => {
      try {
        const r = await api.post<{ say: string; action: PendingActionDTO }>(`/api/actions/${id}/${approve ? "confirm" : "cancel"}`, { lang: uiLang });
        setPending((p) => p.filter((x) => x.id !== id));
        setThread((th) => [...th, { id: `r${id}${Date.now()}`, role: "assistant", content: `${approve ? "✅" : "✖️"} ${r.say}` }]);
        toast(r.say, r.action.status === "failed" ? "error" : approve ? "success" : "info");
        bump();
      } catch (e) {
        toast((e as Error).message, "error");
      }
    },
    [bump, toast, uiLang],
  );

  const newConversation = useCallback(() => {
    stopSpeaking();
    setConversationId(null);
    setThread([]);
    setCaptions({ user: "", mira: "", miraLang: uiLang });
  }, [uiLang]);

  const loadConversation = useCallback(async (id: number) => {
    const r = await api.get<{ messages: { id: number; role: "user" | "assistant"; content: string; lang: Lang; agentId: AgentId }[] }>(`/api/conversations/${id}`);
    setConversationId(id);
    setThread(r.messages.map((m) => ({ id: `h${m.id}`, role: m.role, content: m.content, lang: m.lang, agent: m.agentId })));
    const lastUser = [...r.messages].reverse().find((m) => m.role === "user");
    const lastMira = [...r.messages].reverse().find((m) => m.role === "assistant");
    setCaptions({ user: lastUser?.content ?? "", mira: lastMira?.content ?? "", miraLang: lastMira?.lang ?? "en" });
  }, []);

  const value = useMemo<MiraCtx>(
    () => ({ status, user, authMode, conversationId, thread, orbState, captions, pending, dataVersion, lastDelegations, prefs, toasts, busy, send, startVoice, stopVoice, stopTalking, decide, newConversation, loadConversation, bump, setPref, toast }),
    [status, user, authMode, conversationId, thread, orbState, captions, pending, dataVersion, lastDelegations, prefs, toasts, busy, send, startVoice, stopVoice, stopTalking, decide, newConversation, loadConversation, bump, setPref, toast],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useMira = () => useContext(Ctx);

/** Refetch helper: runs `load` on mount and whenever Mira changes data. */
export function useData<T>(load: () => Promise<T>, deps: unknown[] = []): [T | null, () => void, boolean] {
  const { dataVersion } = useMira();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    load()
      .then((d) => alive && setData(d))
      .catch((e) => console.error(e))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataVersion, tick, ...deps]);
  return [data, () => setTick((x) => x + 1), loading];
}
