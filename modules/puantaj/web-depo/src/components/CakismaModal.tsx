import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, X } from "lucide-react";
import { CakisanSecenek, Tarama } from "../lib/api";

type Props = {
  sonuc: Tarama | null;
  busy?: boolean;
  onSec: (secenek: CakisanSecenek) => void;
  onClose: () => void;
};

export default function CakismaModal({ sonuc, busy = false, onSec, onClose }: Props) {
  const acik = sonuc?.durum === "cakisma" && !!sonuc.cakisan_secenekler?.length;
  return (
    <AnimatePresence>
      {acik && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[90] bg-deep/50 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-3"
          onClick={() => !busy && onClose()}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            onClick={e => e.stopPropagation()}
            className="card shadow-e2 w-full max-w-xl p-5 space-y-4 max-h-[85vh] overflow-auto"
          >
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-xl bg-warn/15 text-warn-ink flex items-center justify-center shrink-0">
                <AlertTriangle size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-display text-lg">Stok seçimi gerekli</h3>
                <p className="text-sm text-ink/70 mt-1">{sonuc?.mesaj}</p>
              </div>
              <button onClick={onClose} disabled={busy} className="p-2 rounded-lg hover:bg-edge/30">
                <X size={16} />
              </button>
            </div>

            <div className="grid sm:grid-cols-3 gap-2 text-xs">
              <Bilgi etiket="Okutulan barkod" deger={sonuc?.raw_input ?? sonuc?.seri ?? ""} />
              <Bilgi etiket="Algılanan seri" deger={sonuc?.resolved_serial ?? sonuc?.seri ?? ""} />
              <Bilgi etiket="Barkod stok kodu" deger={sonuc?.parsed_stock_code ?? "Yok"} />
            </div>

            <div className="space-y-2">
              {sonuc?.cakisan_secenekler?.map(secenek => (
                <button
                  key={`${secenek.seri_id}-${secenek.stok_id}`}
                  onClick={() => onSec(secenek)}
                  disabled={busy}
                  className="w-full text-left rounded-xl border border-edge p-3 hover:border-accent hover:bg-cream transition disabled:opacity-60"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold bg-edge/30 px-2 py-1 rounded">
                      {secenek.stok_kodu}
                    </span>
                    <span className="font-medium truncate">{secenek.urun_adi}</span>
                    <span className={`ml-auto text-xs font-bold ${secenek.sayildi ? "text-warn-ink" : "text-good-ink"}`}>
                      {secenek.sayildi ? "Sayıldı" : "Sayılmadı"}
                    </span>
                  </div>
                  {secenek.barkod_stokuyla_uyumlu_mu && (
                    <div className="mt-2 text-xs text-good-ink flex items-center gap-1">
                      <CheckCircle2 size={13} /> Barkod stok koduyla uyumlu
                    </div>
                  )}
                </button>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Bilgi({ etiket, deger }: { etiket: string; deger: string }) {
  return (
    <div className="rounded-lg border border-edge bg-field p-2 min-w-0">
      <div className="text-ink/50 uppercase tracking-wider">{etiket}</div>
      <div className="font-mono font-bold break-all mt-1">{deger}</div>
    </div>
  );
}
