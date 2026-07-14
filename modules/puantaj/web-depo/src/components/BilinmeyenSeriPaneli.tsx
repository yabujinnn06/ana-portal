import { useState } from "react";
import { motion } from "framer-motion";
import { Plus, Search } from "lucide-react";
import { api, StokOzet } from "../lib/api";
import { useToast } from "../lib/toast";
import { cn } from "../lib/cn";

type Props = {
  oturumId: number;
  seri: string;
  rawSeri: string;
  parsedStockCode?: string | null;
  stoklar: StokOzet[];
  onBitti: () => void;
};

export default function BilinmeyenSeriPaneli({
  oturumId, seri, rawSeri, parsedStockCode, stoklar, onBitti,
}: Props) {
  const toast = useToast();
  const [mod, setMod] = useState<"mevcut" | "yeni">("mevcut");
  const [arama, setArama] = useState("");
  const [secStokId, setSecStokId] = useState<number | null>(null);
  const [yKod, setYKod] = useState("");
  const [yAd, setYAd] = useState("");
  const [yPortal, setYPortal] = useState("");
  const [busy, setBusy] = useState(false);

  const filtre = arama.trim().toLowerCase();
  const liste = filtre
    ? stoklar.filter(s => `${s.stok_kodu} ${s.urun_adi}`.toLowerCase().includes(filtre)).slice(0, 30)
    : stoklar.slice(0, 30);

  async function uygula() {
    setBusy(true);
    try {
      let stokId = secStokId;
      if (mod === "yeni") {
        const r = await api.stokEkle(
          oturumId, yKod || parsedStockCode || seri, yAd || "Sonradan eklendi",
          Number(yPortal) || 0
        );
        stokId = r.id;
        toast.push("ok", `Stok eklendi: ${r.stok_kodu}`);
      }
      if (!stokId) { toast.push("warn", "Stok seç"); return; }
      try {
        await api.seriEkle(stokId, seri, true);
      } catch (e: any) {
        const mesaj = String(e?.message ?? "");
        if (!mesaj.startsWith("ONAY_GEREKLI:")) throw e;
        const uyari = mesaj.replace("ONAY_GEREKLI:", "").trim();
        if (!confirm(`${uyari}\nYine de eklensin mi?`)) return;
        await api.seriEkle(stokId, seri, true, true);
      }
      toast.push("ok", "Seri eklendi ve sayıldı");
      onBitti();
    } catch (e: any) {
      toast.push("err", e.message);
    } finally { setBusy(false); }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
      className="card border-2 border-bad/40 bg-bad/5 p-4 space-y-3"
    >
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[11px] font-bold tracking-label uppercase text-bad-ink">Bilinmeyen seri</span>
        <span className="text-xs text-ink/55">listede yok, sen ekleyebilirsin</span>
      </div>
      <div className="grid sm:grid-cols-3 gap-2 text-xs">
        <Bilgi etiket="Okutulan" deger={rawSeri} />
        <Bilgi etiket="Algılanan stok" deger={parsedStockCode ?? "Yok"} />
        <Bilgi etiket="Eklenecek seri" deger={seri} />
      </div>

      <div className="flex gap-1 text-xs">
        <button onClick={() => setMod("mevcut")} className={cn(
          "px-3 py-1.5 rounded-md", mod === "mevcut" ? "bg-deep text-white" : "bg-edge/30")}>
          Mevcut stoğa ekle
        </button>
        <button onClick={() => setMod("yeni")} className={cn(
          "px-3 py-1.5 rounded-md", mod === "yeni" ? "bg-deep text-white" : "bg-edge/30")}>
          Yeni stok yarat
        </button>
      </div>

      {mod === "mevcut" ? (
        <div className="space-y-2">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink/50" />
            <input value={arama} onChange={e => setArama(e.target.value)}
              placeholder="Stok kodu veya ürün adı..."
              className="w-full pl-8 pr-3 py-2 rounded-lg border border-edge bg-field text-sm" />
          </div>
          <div className="max-h-56 overflow-auto card divide-y divide-edge/40">
            {liste.length === 0 && <div className="p-3 text-sm text-ink/55">Sonuç yok.</div>}
            {liste.map(s => (
              <button key={s.id} onClick={() => setSecStokId(s.id)} className={cn(
                "w-full text-left p-2.5 hover:bg-cream text-sm",
                secStokId === s.id && "bg-deep/15"
              )}>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs bg-edge/30 px-1.5 py-0.5 rounded">{s.stok_kodu}</span>
                  <span className="truncate">{s.urun_adi}</span>
                  <span className="ml-auto text-xs text-ink/55 font-mono">{s.sayilan}/{s.toplam}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <input value={yKod} onChange={e => setYKod(e.target.value)} placeholder="Stok kodu (boş=seri no)"
            className="px-3 py-2 rounded-lg border border-edge bg-field text-sm" />
          <input value={yAd} onChange={e => setYAd(e.target.value)} placeholder="Ürün adı"
            className="px-3 py-2 rounded-lg border border-edge bg-field text-sm" />
          <input value={yPortal} onChange={e => setYPortal(e.target.value)} placeholder="Portal beklenen (opt)"
            type="number" className="px-3 py-2 rounded-lg border border-edge bg-field text-sm" />
        </div>
      )}

      <div className="flex gap-2">
        <button onClick={uygula} disabled={busy || (mod === "mevcut" && !secStokId)}
          className="btn btn-primary text-sm flex items-center gap-1 disabled:opacity-50">
          <Plus size={14} /> Ekle ve say
        </button>
        <button onClick={onBitti}
          className="btn btn-ghost text-sm">İptal</button>
      </div>
    </motion.div>
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
