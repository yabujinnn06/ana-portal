import { Activity } from "lucide-react";
import { Ozet } from "../lib/api";
import { cn } from "../lib/cn";
import NumberTicker from "./ui/NumberTicker";
import ProgressBar from "./ui/ProgressBar";

export default function OzetSeridi({ ozet, taramaDk }: { ozet: Ozet; taramaDk: number }) {
  const fark = ozet.portal_fark;
  const farkCls = fark === 0 ? "bg-good/15 text-good-ink" : fark > 0 ? "bg-warn/15 text-warn-ink" : "bg-bad/15 text-bad-ink";
  const yuzde = ozet.toplam_seri > 0 ? Math.round((ozet.sayilan_seri / ozet.toplam_seri) * 100) : 0;

  return (
    <div className="card flex flex-wrap items-center gap-x-7 gap-y-3 px-5 py-4">
      <div className="flex items-center gap-4 min-w-[210px]">
        <div>
          <div className="text-[11px] uppercase tracking-label text-ink/55">Sayılan</div>
          <div className="font-semibold text-[34px] leading-none tabular-nums">
            <NumberTicker value={ozet.sayilan_seri} />
            <span className="text-ink/40 text-xl">/{ozet.toplam_seri}</span>
          </div>
        </div>
        <div className="hidden sm:block">
          <div className="font-mono text-[13px] font-bold text-ink/70 text-right mb-1">%{yuzde}</div>
          <div className="w-24">
            <ProgressBar value={ozet.sayilan_seri} max={ozet.toplam_seri || 1} tone="good" height={6} />
          </div>
        </div>
      </div>

      <Metrik etiket="Kalan" deger={ozet.kalan_seri} onem={ozet.kalan_seri > 0} />
      <Metrik etiket="Stok" deger={ozet.stok_sayisi} />

      <div className="flex items-center gap-1.5">
        <span className="text-[11px] uppercase tracking-label text-ink/55">Portal fark</span>
        <span className={cn("font-mono text-[15px] font-bold rounded-md px-2 py-0.5", farkCls)}>
          {fark > 0 ? "+" : ""}{fark}
        </span>
      </div>

      <div className="ml-auto flex items-center gap-1.5 text-ink/60">
        <Activity size={15} />
        <span className="font-mono text-[15px] font-bold text-ink tabular-nums">{taramaDk}</span>
        <span className="text-[11px] uppercase tracking-label">tarama/dk</span>
      </div>
    </div>
  );
}

function Metrik({ etiket, deger, onem }: { etiket: string; deger: number; onem?: boolean }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-label text-ink/55">{etiket}</div>
      <div className={cn("font-semibold text-[22px] leading-none tabular-nums mt-0.5", onem && "text-flame-ink")}>{deger}</div>
    </div>
  );
}
