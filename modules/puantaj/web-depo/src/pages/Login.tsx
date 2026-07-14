import { FormEvent, useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import Filigran from "../components/Filigran";
import { useAuth } from "../lib/auth";
import { cn } from "../lib/cn";

const BOOT_LOG = [
  "exec autoexec.cfg",
  "net_connect depo.rainwater.local:443",
  "puantaj_zeka modülü hazır",
  "auth modülü hazır — kimlik bekleniyor",
];

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [ad, setAd] = useState("admin");
  const [pin, setPin] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      await login(ad, pin);
      nav("/");
    } catch (e: any) {
      setErr(e.message ?? "Giriş başarısız. Kullanıcı adını ve PIN'i kontrol edin.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen relative overflow-hidden bg-black flex items-center justify-center px-4 py-10 font-mono">
      {/* CRT taramasi + vinyet — GoldSrc konsolu hissi */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.14]"
        style={{ backgroundImage: "repeating-linear-gradient(0deg, transparent 0, transparent 2px, #fff 3px, transparent 4px)" }}
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: "radial-gradient(120% 90% at 50% 40%, transparent 40%, rgba(0,0,0,.85) 100%)" }}
      />
      <div className="absolute inset-0 pointer-events-none bg-[#141a10]/40" />

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="relative z-10 w-full max-w-lg"
      >
        {/* Ust bant — eski konsol basligi, "====" ayrac CSS kenarligiyla (sabit metin tasmayi onlemek icin) */}
        <div className="border-t border-dashed border-ink/25" />
        <div className="flex items-baseline justify-between py-2">
          <div className="text-2xl font-bold tracking-wide text-ink">
            RAINWATER<span className="text-accent">/</span><span className="text-ink/50 text-base">DEPO</span>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-good-ink">
            <span className="h-1.5 w-1.5 rounded-full bg-good-ink animate-pulse" /> LIVE
          </div>
        </div>
        <div className="border-t border-dashed border-ink/25" />

        {/* Konsol log akisi — dekoratif boot cikti */}
        <div className="mt-4 space-y-1 text-[12px] leading-relaxed">
          {BOOT_LOG.map((line, i) => (
            <motion.div
              key={line}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.12 * i, duration: 0.15 }}
              className="text-ink/40 break-all"
            >
              <span className="text-ink/25">]</span> {line}
            </motion.div>
          ))}
        </div>

        <form onSubmit={onSubmit} className="mt-5 space-y-3">
          <label className="flex items-baseline gap-2 text-sm">
            <span className="shrink-0 text-good-ink">login&gt;</span>
            <input
              className="flex-1 min-w-0 bg-transparent border-0 border-b border-ink/20 focus:border-accent outline-none py-1 text-ink placeholder:text-ink/25 transition-colors"
              value={ad}
              onChange={e => setAd(e.target.value)}
              autoComplete="username"
              autoFocus
              spellCheck={false}
            />
          </label>

          <label className="flex items-baseline gap-2 text-sm">
            <span className="shrink-0 text-good-ink">pin&gt;&nbsp;&nbsp;&nbsp;</span>
            <input
              type="password"
              autoComplete="current-password"
              className="flex-1 min-w-0 bg-transparent border-0 border-b border-ink/20 focus:border-accent outline-none py-1 text-ink tracking-[0.3em] transition-colors"
              value={pin}
              onChange={e => setPin(e.target.value)}
            />
          </label>

          {err && (
            <div className="text-[12px] text-bad-ink">
              <span className="text-bad-ink/70">!</span> {err}
            </div>
          )}

          <div className="pt-2 flex items-center gap-3">
            <button
              type="submit"
              disabled={busy}
              className={cn(
                "text-sm tracking-wide px-4 py-2 border transition-colors disabled:opacity-40 disabled:pointer-events-none",
                "border-accent/50 text-accent hover:bg-accent/10 hover:border-accent active:translate-y-px",
              )}
            >
              {busy ? "[ BAĞLANIYOR... ]" : "[ GİRİŞ YAP ]"}
            </button>
            <span className="inline-block w-2 h-3.5 bg-ink/30 animate-caret" />
          </div>
        </form>

        <div className="mt-8 border-t border-dashed border-ink/25" />
        <div className="pt-2 text-[10px] text-ink/25">
          Rainwater Depo Sistemi — build {new Date().getFullYear()}.07
        </div>
      </motion.div>
      <Filigran />
    </div>
  );
}
