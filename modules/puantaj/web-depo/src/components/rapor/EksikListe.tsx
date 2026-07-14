import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { EksikGrup } from "../../lib/api";
import { cn } from "../../lib/cn";
import PanelHeader from "../ui/PanelHeader";

export default function EksikListe({ rows }: { rows: EksikGrup[] }) {
  const [acik, setAcik] = useState<Set<number>>(new Set());

  function topla(id: number) {
    setAcik(s => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  const toplamEksik = rows.reduce((a, b) => a + b.eksik, 0);

  return (
    <div className="card overflow-hidden">
      <PanelHeader title="Eksik seriler" meta={`${rows.length} stok · ${toplamEksik} seri`} />
      <div className="max-h-[480px] overflow-auto divide-y divide-edge/40">
        {rows.length === 0 && (
          <div className="p-6 text-center text-good-ink">
            Tüm stoklar tam sayılmış.
          </div>
        )}
        {rows.map((g) => {
          const isOpen = acik.has(g.stok_id);
          const yuzde = g.toplam > 0 ? Math.round((g.sayilan / g.toplam) * 100) : 0;
          return (
            <div key={g.stok_id}>
              <button
                onClick={() => topla(g.stok_id)}
                className="w-full text-left p-3 hover:bg-cream/70 transition-colors flex items-center gap-3"
              >
                <ChevronDown
                  size={16}
                  className={cn("text-ink/40 transition-transform", isOpen && "rotate-180")}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-edge/30">{g.stok_kodu}</span>
                    <span className="truncate font-medium">{g.urun_adi}</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-edge/40 overflow-hidden">
                    <div className="h-full bg-deep" style={{ width: `${yuzde}%` }} />
                  </div>
                </div>
                <div className="text-right text-sm shrink-0">
                  <div className="font-mono tabular-nums">
                    <span className="text-bad-ink font-bold">{g.eksik}</span>
                    <span className="text-ink/40"> / {g.toplam}</span>
                  </div>
                  <div className="text-[11px] uppercase tracking-label text-ink/55">eksik</div>
                </div>
              </button>
              {isOpen && (
                <div className="px-10 pb-3">
                  <div className="text-[11px] uppercase tracking-label text-ink/55 mb-1.5">
                    Sayılmamış seriler ({g.seriler.length} örnek)
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {g.seriler.map(s => (
                      <span key={s}
                        className="px-2 py-0.5 rounded-md bg-bad/10 border border-bad/20 font-mono text-xs">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
