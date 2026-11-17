/** Owner sign-in (password mode, e.g. on Vercel). */
import { useState } from "react";
import { Lock } from "lucide-react";
import { Orb } from "../components/Orb";
import { useI18n } from "../i18n";

export function LoginPage() {
  const { t, lang, setLang } = useI18n();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
    if (res.ok) {
      window.location.replace("/");
      return;
    }
    const body = await res.json().catch(() => ({}));
    setError(res.status === 429 ? t.login.tooMany : body.message && res.status !== 401 ? body.message : t.login.wrong);
    setBusy(false);
  };

  return (
    <div className="flex min-h-full flex-col items-center justify-center px-4 py-10">
      <button onClick={() => setLang(lang === "en" ? "ar" : "en")} className="absolute end-4 top-4 rounded-lg border border-white/10 px-2.5 py-1 text-xs text-zinc-300">
        {lang === "en" ? "ع" : "EN"}
      </button>
      <Orb state={busy ? "thinking" : "idle"} size={220} />
      <h1 className="mt-2 text-2xl font-semibold">{t.appName}</h1>
      <p className="mb-6 text-sm text-zinc-400">{t.tagline}</p>
      <form onSubmit={submit} className="glass w-full max-w-sm space-y-3 rounded-2xl p-5">
        <label htmlFor="owner-password" className="label flex items-center gap-1.5">
          <Lock className="h-3.5 w-3.5" /> {t.login.password}
        </label>
        <input id="owner-password" type="password" autoFocus autoComplete="current-password" required className="input" value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <p className="text-sm text-red-300">{error}</p>}
        <button className="btn-primary w-full" disabled={busy}>{t.login.signIn}</button>
      </form>
    </div>
  );
}
