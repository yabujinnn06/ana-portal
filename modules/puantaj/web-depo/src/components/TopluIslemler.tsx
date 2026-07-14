import { useState } from "react";
import { motion } from "framer-motion";
import { ChevronDown, Layers, LogOut as LogOutIcon, PackagePlus } from "lucide-react";
import { api } from "../lib/api";
import { useToast } from "../lib/toast";
import { cn } from "../lib/cn";

type Props = {
  oturumId: number;
  aktif: boolean;
  onDegisti?: () => void;
};

type Mod = "giris" | "cikis";

export default function TopluIslemler({ oturumId, aktif, onDegisti }: Props) {
  const toast = useToast();
  const [acik, setAcik] = useState(false);
  const [mod, setMod] = useState<Mod>("giris");
  const [metin, setMetin] = useState("");
  const [notu, setNotu] = useState("");
  const [sonuc, setSonuc] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const SERISIZ_RX = /^(.+?)\s*\(?\s*seris[ıi]z\s*\)?\s*[x*]\s*(\d+)\s*$/i;

  function girisAyir() {
    const normal: { stok_kodu: string; urun_adi?: string; seri_no: string; portal_sayim?: number }[] = [];
    const serisiz: { stok_kodu: string; adet: number }[] = [];
    metin.split(/\r?\n/).forEach(line => {
      const value = line.trim();
      if (!value) return;
      const match = value.match(SERISIZ_RX);
      if (match) {
        const adet = Number(match[2]) || 0;
        if (adet > 0) serisiz.push({ stok_kodu: match[1].trim(), adet });
        return;
      }
      const parts = (/[	;,]/.test(value) ? value.split(/[	;,]/) : value.split(/\s+/))
        .map(part => part.trim()).filter(Boolean);
      if (parts.length === 2) normal.push({ stok_kodu: parts[0], seri_no: parts[1] });
      else if (parts.length === 3) normal.push({ stok_kodu: parts[0], urun_adi: parts[1], seri_no: parts[2] });
      else if (parts.length >= 4) {
        normal.push({ stok_kodu: parts[0], urun_adi: parts[1], seri_no: parts[2], portal_sayim: Number(parts[3]) || 0 });
      }
    });
    return { normal, serisiz };
  }

  async function calistir() {
    setBusy(true);
    setSonuc(null);
    try {
      if (mod === "giris") {
        const { normal, serisiz } = girisAyir();
        if (!normal.length && !serisiz.length) {
          toast.push("warn", "Geçerli stok ve seri satırı bulunamadı.");
          return;
        }
        let yeniStok = 0;
        let yeniSeri = 0;
        let serisizSeri = 0;
        let mukerrer = 0;
        if (normal.length) {
          const result = await api.topluGiris(oturumId, normal);
          yeniStok += result.yeni_stok;
          yeniSeri += result.yeni_seri;
          mukerrer += result.mukerrer;
        }
        if (serisiz.length) {
          const result = await api.serisizGiris(oturumId, serisiz);
          yeniStok += result.yeni_stok;
          serisizSeri += result.yeni_seri;
        }
        setSonuc(`stok +${yeniStok} · seri +${yeniSeri} · serisiz +${serisizSeri} · mükerrer ${mukerrer}`);
      } else {
        const seriler = metin.split(/[\r\n,;]+/).map(value => value.trim()).filter(Boolean);
        if (!seriler.length) {
          toast.push("warn", "Seri numarası listesi boş.");
          return;
        }
        const result = await api.topluCikis(oturumId, seriler, notu || undefined);
        setSonuc(`işaretlenen ${result.isaretlenen} · zaten çıkış ${result.zaten_cikis} · bulunamadı ${result.bulunamadi.length}`);
      }
      toast.push("ok", `Toplu ${mod === "giris" ? "giriş" : "çıkış"} tamamlandı.`);
      setMetin("");
      setNotu("");
      onDegisti?.();
    } catch (e: any) {
      toast.push("err", e.message);
    } finally {
      setBusy(false);
    }
  }

  const config = mod === "giris"
    ? { icon: PackagePlus, label: "Giriş", color: "bg-deep text-white", placeholder: "STOK, ÜRÜN, SERİ, PORTAL\n10036, NEW OSMOS, RW96578, 15\n\n10036 (serisiz)x10" }
    : { icon: LogOutIcon, label: "Çıkış", color: "bg-bad text-white", placeholder: "Her satıra bir seri numarası\nRW96578\nRW96580" };

  return (
    <div className="card overflow-hidden">
      <button onClick={() => setAcik(value => !value)} disabled={!aktif}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-cream transition">
        <span className="flex items-center gap-2 font-medium">
          <Layers size={16} className="text-accent" />
          Toplu işlemler
          <span className="text-[11px] uppercase tracking-label text-ink/55">giriş · çıkış</span>
        </span>
        <ChevronDown size={16} className={cn("transition-transform", acik && "rotate-180")} />
      </button>

      {acik && aktif && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
          className="border-t border-edge/60 p-4 space-y-3">
          <div className="inline-flex p-1 bg-field border border-edge text-xs">
            {(["giris", "cikis"] as const).map(value => {
              const Icon = value === "giris" ? PackagePlus : LogOutIcon;
              return <button key={value} onClick={() => setMod(value)}
                className={cn("h-8 px-3 flex items-center gap-1.5", mod === value ? "bg-accent text-white font-semibold" : "hover:bg-edge/40")}>
                <Icon size={13} /> {value === "giris" ? "Giriş" : "Çıkış"}
              </button>;
            })}
          </div>
          <textarea value={metin} onChange={e => setMetin(e.target.value)} rows={5}
            placeholder={config.placeholder} className="w-full px-3 py-2 border border-edge bg-field font-mono text-sm" />
          {mod === "cikis" && <input value={notu} onChange={e => setNotu(e.target.value)} placeholder="Çıkış notu (isteğe bağlı)"
            className="w-full h-10 px-3 border border-edge bg-field text-sm" />}
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={calistir} disabled={busy}
              className={cn("btn text-sm flex items-center gap-1.5 disabled:opacity-50", config.color)}>
              <config.icon size={14} /> {config.label} çalıştır
            </button>
            {sonuc && <span className="text-sm text-good-ink font-mono break-all">{sonuc}</span>}
          </div>
        </motion.div>
      )}
    </div>
  );
}
