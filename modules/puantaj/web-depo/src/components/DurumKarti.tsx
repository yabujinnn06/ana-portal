import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, AlertTriangle, XCircle, GitMerge, Hourglass } from "lucide-react";
import { Tarama } from "../lib/api";
import { cn } from "../lib/cn";

const cfg = {
  basarili: {
    band: "bg-good", panel: "bg-good/10 border-good/40", icon: <CheckCircle2 size={22} className="text-good-ink" />,
    label: "SAYILDI", labelCls: "text-good-ink",
  },
  mukerrer: {
    band: "bg-warn", panel: "bg-warn/10 border-warn/50", icon: <AlertTriangle size={22} className="text-warn-ink" />,
    label: "MÜKERRER", labelCls: "text-warn-ink",
  },
  bulunamadi: {
    band: "bg-bad", panel: "bg-bad/10 border-bad/40", icon: <XCircle size={22} className="text-bad-ink" />,
    label: "BULUNAMADI", labelCls: "text-bad-ink",
  },
  cakisma: {
    band: "bg-warn", panel: "bg-warn/10 border-warn/50", icon: <GitMerge size={22} className="text-warn-ink" />,
    label: "ÇAKIŞMA", labelCls: "text-warn-ink",
  },
  bos: {
    band: "bg-edge", panel: "bg-card border-edge", icon: <Hourglass size={20} className="text-ink/40" />,
    label: "HAZIR", labelCls: "text-ink/50",
  },
} as const;

export default function DurumKarti({ son }: { son: Tarama | null }) {
  const durum = (son?.durum ?? "bos") as keyof typeof cfg;
  const c = cfg[durum];

  return (
    <div className={cn("relative overflow-hidden rounded-xl border-2 transition-colors duration-200", c.panel)}>
      <span className={cn("absolute left-0 top-0 bottom-0 w-1.5 transition-colors", c.band)} />
      <div className="pl-5 pr-4 py-4">
        <div className="flex items-center gap-2.5">
          {c.icon}
          <span className={cn("text-[15px] font-bold uppercase tracking-[0.14em]", c.labelCls)}>{c.label}</span>
          {son?.stok_kodu && (
            <span className="ml-auto font-mono text-sm font-bold bg-white/70 border border-edge rounded-md px-2 py-1">
              {son.stok_kodu}
            </span>
          )}
        </div>
        <AnimatePresence mode="wait">
          <motion.div
            key={(son?.seri ?? "bos") + (son?.durum ?? "")}
            initial={{ opacity: 0, y: 3 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.1 }}
          >
            <div className="font-mono text-4xl sm:text-5xl font-bold mt-2.5 break-all leading-none tracking-tight">
              {son?.seri ?? "—"}
            </div>
            <div className="text-[15px] text-ink/70 mt-2">{son?.mesaj ?? "Tarama bekleniyor"}</div>
          </motion.div>
        </AnimatePresence>

        {son?.stok_kodu && son.sayilan != null && (
          <div className="mt-4 grid grid-cols-3 sm:grid-cols-4 gap-2">
            <Sayac etiket="Sayılan" deger={son.sayilan} vurgu />
            <Sayac etiket="Stokta" deger={son.toplam ?? 0} />
            <Sayac etiket="Kalan" deger={son.kalan ?? 0} />
            <div className="col-span-3 sm:col-span-1 rounded-lg bg-white/60 border border-edge/70 px-3 py-2">
              <div className="text-[10px] uppercase tracking-label text-ink/50">Portal / Fark</div>
              <div className="font-mono text-xl font-bold tabular-nums leading-tight">
                {son.portal_sayim ?? "—"}
                {typeof son.portal_fark === "number" && (
                  <span className={cn(
                    "ml-1.5 text-sm",
                    son.portal_fark === 0 ? "text-good-ink" : son.portal_fark > 0 ? "text-warn-ink" : "text-bad-ink",
                  )}>
                    {son.portal_fark > 0 ? "+" : ""}{son.portal_fark}
                  </span>
                )}
              </div>
            </div>
            {son.urun_adi && (
              <div className="col-span-3 sm:col-span-4 text-sm text-ink/60 truncate">{son.urun_adi}</div>
            )}
          </div>
        )}

        {son?.cakisan_stoklar && (
          <div className="mt-2 text-sm">
            <span className="text-ink/55">Çakışan stoklar:</span>{" "}
            <b className="font-mono">{son.cakisan_stoklar.join(", ")}</b>
          </div>
        )}
      </div>
    </div>
  );
}

function Sayac({ etiket, deger, vurgu }: { etiket: string; deger: number; vurgu?: boolean }) {
  return (
    <div className={cn("rounded-lg border px-3 py-2", vurgu ? "bg-deep text-white border-accent" : "bg-white/60 border-edge/70")}>
      <div className={cn("text-[10px] uppercase tracking-label", vurgu ? "text-white/60" : "text-ink/50")}>{etiket}</div>
      <div className="font-mono text-xl font-bold tabular-nums leading-tight">{deger}</div>
    </div>
  );
}
