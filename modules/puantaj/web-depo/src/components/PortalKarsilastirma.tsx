import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, TrendingDown, TrendingUp, Equal } from "lucide-react";
import { Ozet, StokOzet } from "../lib/api";
import { cn } from "../lib/cn";
import PanelHeader from "./ui/PanelHeader";

type Props = {
  ozet: Ozet;
  stoklar: StokOzet[];
};

function farkIkon(fark: number) {
  if (fark === 0) return Equal;
  if (fark > 0) return TrendingUp;
  return TrendingDown;
}

function farkCls(fark: number): string {
  if (fark === 0) return "text-good-ink";
  if (fark > 0) return "text-warn-ink";
  return "text-bad-ink";
}

export default function PortalKarsilastirma({ ozet, stoklar }: Props) {
  const [acik, setAcik] = useState(false);

  const topSapma = useMemo(() => {
    return [...stoklar]
      .filter(s => s.portal_sayim > 0 || s.toplam > 0)
      .map(s => ({ ...s, fark: s.sayilan - s.portal_sayim, mutlak: Math.abs(s.sayilan - s.portal_sayim) }))
      .filter(s => s.fark !== 0)
      .sort((a, b) => b.mutlak - a.mutlak)
      .slice(0, 6);
  }, [stoklar]);

  return (
    <div className="card overflow-hidden">
      <button onClick={() => setAcik(v => !v)} className="w-full">
        <PanelHeader
          title="Portal karşılaştırma"
          meta={`portal ${ozet.portal_toplam} · fark ${ozet.portal_fark > 0 ? "+" : ""}${ozet.portal_fark}`}
          action={acik ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        />
      </button>
      {acik && (
        <div className="p-4">
          {topSapma.length === 0 ? (
            <div className="text-sm text-ink/55 text-center py-2">Sapma yok.</div>
          ) : (
            <div className="space-y-0.5">
              <div className="text-[11px] uppercase tracking-label text-ink/55 mb-1.5">En büyük sapmalar</div>
              <ul className="divide-y divide-edge/40">
                {topSapma.map(s => {
                  const Ikon = farkIkon(s.fark);
                  return (
                    <li key={s.id} className="flex items-center gap-2 py-1.5 text-sm">
                      <span className="font-mono text-[11px] bg-edge/25 px-1.5 py-0.5 rounded shrink-0">{s.stok_kodu}</span>
                      <span className="truncate flex-1 min-w-0 text-ink/80">{s.urun_adi}</span>
                      <span className="font-mono text-[12px] text-ink/50 shrink-0">{s.sayilan}/{s.portal_sayim}</span>
                      <span className={cn("inline-flex items-center gap-0.5 font-mono text-sm font-semibold tabular-nums shrink-0", farkCls(s.fark))}>
                        <Ikon size={12} />
                        {s.fark > 0 ? "+" : ""}{s.fark}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
