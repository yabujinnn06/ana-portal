import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, CheckCircle2, Circle, LogOut as LogOutIcon, UserCheck, Pencil, Check } from "lucide-react";
import { api } from "../lib/api";
import { cn } from "../lib/cn";
import { useToast } from "../lib/toast";

type Seri = {
  id: number; seri_no: string; sayildi: boolean; sayim_tarihi: string | null;
  sayan_ad: string | null; sonradan_eklendi: boolean;
  cikis_zaman: string | null; cikis_kullanici_ad: string | null; cikis_notu: string | null;
  zimmet_kullanici_id: number | null; zimmet_kullanici_ad: string | null;
  zimmet_employee_id: number | null; zimmet_employee_ad: string | null;
  zimmet_zaman: string | null; zimmet_notu: string | null;
};

function zimmetliMi(s: Seri): boolean { return !!(s.zimmet_employee_id || s.zimmet_kullanici_id); }
function zimmetAdi(s: Seri): string | null { return s.zimmet_employee_ad ?? s.zimmet_kullanici_ad; }

type Props = {
  stokId: number | null;
  stokKodu?: string;
  urunAdi?: string;
  portalSayim?: number;
  onClose: () => void;
};

const FILTRE_ET: Record<string, string> = {
  tum: "tümü", sayilan: "sayılan", kalan: "kalan", cikti: "çıkış", zimmet: "zimmet",
};

export default function StokDetayModal({ stokId, stokKodu, urunAdi, portalSayim, onClose }: Props) {
  const toast = useToast();
  const [seriler, setSeriler] = useState<Seri[]>([]);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [filtre, setFiltre] = useState<"tum" | "sayilan" | "kalan" | "cikti" | "zimmet">("tum");
  const [duzenleId, setDuzenleId] = useState<number | null>(null);
  const [duzenleVal, setDuzenleVal] = useState("");
  const [kaydediliyor, setKaydediliyor] = useState(false);

  useEffect(() => {
    if (stokId == null) return;
    setYukleniyor(true);
    api.stokSeriler(stokId)
      .then(setSeriler)
      .finally(() => setYukleniyor(false));
  }, [stokId]);

  function baslatDuzenle(s: Seri) {
    setDuzenleId(s.id);
    setDuzenleVal(s.seri_no);
  }
  function iptal() {
    setDuzenleId(null);
    setDuzenleVal("");
  }
  async function kaydet() {
    if (duzenleId == null) return;
    const v = duzenleVal.trim();
    if (!v) { toast.push("warn", "Seri boş olamaz"); return; }
    setKaydediliyor(true);
    try {
      const g = await api.seriYenidenAdlandir(duzenleId, v);
      setSeriler(prev => prev.map(x => x.id === duzenleId ? { ...x, seri_no: g.seri_no } : x));
      toast.push("ok", "Seri güncellendi");
      iptal();
    } catch (e: any) {
      toast.push("err", e.message);
    } finally {
      setKaydediliyor(false);
    }
  }

  if (stokId == null) return null;

  const sayilan = seriler.filter(s => s.sayildi).length;
  const cikti = seriler.filter(s => s.cikis_zaman).length;
  const zimmette = seriler.filter(zimmetliMi).length;

  const gosterilen = seriler.filter(s => {
    if (filtre === "sayilan") return s.sayildi;
    if (filtre === "kalan") return !s.sayildi && !s.cikis_zaman;
    if (filtre === "cikti") return !!s.cikis_zaman;
    if (filtre === "zimmet") return zimmetliMi(s);
    return true;
  });

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="fixed inset-0 z-[60] bg-deep/50 backdrop-blur-[2px] flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.98 }}
          transition={{ duration: 0.15 }}
          className="card shadow-e2 w-full max-w-3xl max-h-[85vh] overflow-hidden flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-5 py-3 border-b border-edge/60 flex items-center gap-3">
            <span className="font-mono text-xs bg-edge/30 px-2 py-0.5 rounded">{stokKodu}</span>
            <div className="flex-1 min-w-0">
              <div className="font-display text-lg truncate">{urunAdi}</div>
              <div className="text-xs text-ink/55 font-mono">
                {seriler.length} seri · sayılan {sayilan} · kalan {seriler.length - sayilan - cikti}
                {cikti > 0 && ` · çıkış ${cikti}`}
                {zimmette > 0 && ` · zimmet ${zimmette}`}
                {portalSayim ? ` · portal ${portalSayim} (fark ${sayilan - portalSayim > 0 ? "+" : ""}${sayilan - portalSayim})` : ""}
              </div>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-edge/30 rounded-md">
              <X size={16} />
            </button>
          </div>

          <div className="px-4 py-2 border-b border-edge/40 flex items-center gap-1 text-xs">
            {(["tum", "sayilan", "kalan", "cikti", "zimmet"] as const).map(f => (
              <button key={f} onClick={() => setFiltre(f)} className={cn(
                "px-2.5 py-1 rounded-md",
                filtre === f ? "bg-deep text-white font-semibold" : "bg-edge/20 hover:bg-edge/40")}>
                {FILTRE_ET[f]}
              </button>
            ))}
            <span className="ml-auto text-ink/55 font-mono">{gosterilen.length} satır</span>
          </div>

          <div className="flex-1 overflow-auto">
            {yukleniyor ? (
              <div className="p-6 text-center text-ink/55">Yükleniyor...</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-cream/80 sticky top-0">
                  <tr className="text-left text-[11px] uppercase tracking-label text-ink/55">
                    <th className="px-3 py-2 w-8"></th>
                    <th className="px-3 py-2">Seri</th>
                    <th className="px-3 py-2">Durum</th>
                    <th className="px-3 py-2">Sayan</th>
                    <th className="px-3 py-2">Zaman</th>
                  </tr>
                </thead>
                <tbody>
                  {gosterilen.map(s => {
                    const status = s.cikis_zaman ? "cikti" : zimmetliMi(s) ? "zimmet" : s.sayildi ? "sayilan" : "kalan";
                    return (
                      <tr key={s.id} className={cn(
                        "border-t border-edge/40",
                        status === "sayilan" && "bg-good/8",
                        status === "cikti" && "bg-bad/8",
                        status === "zimmet" && "bg-warn/10",
                      )}>
                        <td className="px-3 py-1.5">
                          {status === "sayilan" && <CheckCircle2 size={14} className="text-good-ink" />}
                          {status === "kalan" && <Circle size={14} className="text-ink/30" />}
                          {status === "cikti" && <LogOutIcon size={14} className="text-bad-ink" />}
                          {status === "zimmet" && <UserCheck size={14} className="text-warn-ink" />}
                        </td>
                        <td className="px-3 py-1.5 font-mono">
                          {duzenleId === s.id ? (
                            <span className="inline-flex items-center gap-1">
                              <input
                                value={duzenleVal}
                                onChange={e => setDuzenleVal(e.target.value)}
                                onKeyDown={e => { if (e.key === "Enter") kaydet(); if (e.key === "Escape") iptal(); }}
                                autoFocus
                                className="w-36 px-2 py-0.5 rounded border border-accent/40 bg-field font-mono text-xs outline-none"
                              />
                              <button onClick={kaydet} disabled={kaydediliyor}
                                className="p-1 rounded text-good-ink hover:bg-good/10 disabled:opacity-50" title="Kaydet">
                                <Check size={13} />
                              </button>
                              <button onClick={iptal}
                                className="p-1 rounded text-ink/50 hover:bg-edge/30" title="İptal">
                                <X size={13} />
                              </button>
                            </span>
                          ) : (
                            <span className="group inline-flex items-center gap-1">
                              {s.seri_no}
                              {s.sonradan_eklendi && <span className="ml-0.5 text-[9px] uppercase tracking-wide text-accent">+ek</span>}
                              <button onClick={() => baslatDuzenle(s)}
                                className="p-1 rounded text-ink/30 hover:text-accent hover:bg-edge/30 opacity-0 group-hover:opacity-100 transition"
                                title="Seri no düzenle">
                                <Pencil size={11} />
                              </button>
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-1.5 text-xs">
                          {status === "sayilan" && "Sayıldı"}
                          {status === "kalan" && "Sayılmadı"}
                          {status === "cikti" && (<span>Çıktı{s.cikis_notu ? ` · ${s.cikis_notu}` : ""}</span>)}
                          {status === "zimmet" && (<span>Zimmet → <b>{zimmetAdi(s)}</b>{s.zimmet_notu ? ` · ${s.zimmet_notu}` : ""}</span>)}
                        </td>
                        <td className="px-3 py-1.5 text-xs text-ink/65">{s.sayan_ad ?? s.cikis_kullanici_ad ?? "-"}</td>
                        <td className="px-3 py-1.5 text-xs text-ink/65 whitespace-nowrap font-mono">
                          {s.cikis_zaman ?? s.zimmet_zaman ?? s.sayim_tarihi ?? "-"}
                        </td>
                      </tr>
                    );
                  })}
                  {gosterilen.length === 0 && (
                    <tr><td colSpan={5} className="p-6 text-center text-ink/55">Eşleşen yok.</td></tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
