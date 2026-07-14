import { memo, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { StokOzet } from "../lib/api";
import { cn } from "../lib/cn";
import PanelHeader from "./ui/PanelHeader";

const FILTRE_ET: Record<string, string> = { tum: "tümü", eksik: "eksik", tam: "tam" };

function _StokListesi({ rows, onSec, bosMesaj }: { rows: StokOzet[]; onSec?: (s: StokOzet) => void; bosMesaj?: string }) {
  const [q, setQ] = useState("");
  const [filtre, setFiltre] = useState<"tum" | "eksik" | "tam">("tum");

  const filtered = useMemo(() => {
    const qNorm = q.trim().toLowerCase();
    return rows.filter(s => {
      if (qNorm && !(`${s.stok_kodu} ${s.urun_adi}`.toLowerCase().includes(qNorm))) return false;
      const tam = s.toplam > 0 && s.sayilan >= s.toplam;
      if (filtre === "eksik" && tam) return false;
      if (filtre === "tam" && !tam) return false;
      return true;
    });
  }, [rows, q, filtre]);

  const tamSayisi = rows.filter(s => s.toplam > 0 && s.sayilan >= s.toplam).length;

  return (
    <div className="card overflow-hidden">
      <PanelHeader
        title="Stoklar"
        meta={`${rows.length} kalem · ${tamSayisi} tam`}
        action={
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center gap-1 text-xs">
              {(["tum", "eksik", "tam"] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFiltre(f)}
                  className={cn(
                    "px-2 py-1 rounded-md transition-colors",
                    filtre === f ? "bg-field text-accent font-semibold" : "bg-white/10 hover:bg-white/20"
                  )}
                >{FILTRE_ET[f]}</button>
              ))}
            </div>
            <label className="relative flex items-center">
              <Search size={13} className="absolute left-2 opacity-70" />
              <input
                value={q} onChange={e => setQ(e.target.value)}
                placeholder="ara..."
                className="pl-7 pr-2 py-1 rounded-md bg-white/10 placeholder:text-white/50 text-xs w-28 focus:w-40 transition-all outline-none focus:bg-white/20"
              />
            </label>
          </div>
        }
      />
      <div className="max-h-[460px] overflow-auto overflow-x-auto">
        <table className="w-full text-sm min-w-[520px]">
          <thead className="bg-cream sticky top-0 z-10">
            <tr className="text-left text-[11px] uppercase tracking-label text-ink/55">
              <th className="px-3 py-2">Kod</th>
              <th className="px-3 py-2">Ürün</th>
              <th className="px-3 py-2 text-right">Sayılan</th>
              <th className="px-3 py-2 text-right">Toplam</th>
              <th className="px-3 py-2 text-right">Portal</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-edge/40">
            {filtered.map((s) => {
              const tam = s.toplam > 0 && s.sayilan >= s.toplam;
              const fark = s.sayilan - s.portal_sayim;
              const yuzde = s.toplam > 0 ? Math.min(100, (s.sayilan / s.toplam) * 100) : 0;
              return (
                <tr
                  key={s.id}
                  onClick={() => onSec?.(s)}
                  className={cn("hover:bg-cream/60", onSec && "cursor-pointer")}
                >
                  <td className={cn("px-3 py-2 font-mono text-xs", tam && "border-l-2 border-l-good")}>
                    {s.stok_kodu}
                    {s.sonradan_eklendi && (
                      <span className="ml-1 text-[10px] uppercase tracking-wide text-warn-ink font-bold">+ek</span>
                    )}
                  </td>
                  <td className="px-3 py-2 max-w-[260px]">
                    <div className="truncate">{s.urun_adi}</div>
                    {s.toplam > 0 && (
                      <div className="mt-1 h-[3px] rounded-full bg-edge/40 overflow-hidden">
                        <div className={cn("h-full rounded-full", tam ? "bg-good" : "bg-deep")}
                          style={{ width: `${yuzde}%` }} />
                      </div>
                    )}
                  </td>
                  <td className={cn("px-3 py-2 text-right font-mono tabular-nums font-semibold", tam && "text-good-ink")}>{s.sayilan}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-ink/70">{s.toplam}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">
                    <span className="text-ink/55">{s.portal_sayim || "-"}</span>
                    {s.portal_sayim > 0 && s.sayilan > 0 && (
                      <span className={cn(
                        "ml-1 text-[11px]",
                        fark === 0 ? "text-good-ink" : fark < 0 ? "text-bad-ink" : "text-warn-ink"
                      )}>
                        {fark > 0 ? `+${fark}` : fark}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={5} className="p-6 text-center text-ink/55">
                {rows.length === 0 ? (bosMesaj ?? "Stok yok. Excel yükleyin.") : "Eşleşen yok."}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default memo(_StokListesi);
