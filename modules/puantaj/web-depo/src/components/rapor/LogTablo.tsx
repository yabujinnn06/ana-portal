import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { api, KullaniciIstatistik, LogSatir } from "../../lib/api";
import PanelHeader from "../ui/PanelHeader";
import { Button } from "../ui/Button";
import StatusBadge, { TARAMA_DURUM } from "../ui/StatusBadge";

const PAGE = 50;

type Props = { oturumId: number; kullanicilar: KullaniciIstatistik[] };

export default function LogTablo({ oturumId, kullanicilar }: Props) {
  const [rows, setRows] = useState<LogSatir[]>([]);
  const [toplam, setToplam] = useState(0);
  const [durum, setDurum] = useState<string>("");
  const [kullaniciId, setKullaniciId] = useState<number | "">("");
  const [q, setQ] = useState("");
  const [sayfa, setSayfa] = useState(0);
  const [yukleniyor, setYukleniyor] = useState(false);

  async function yukle() {
    setYukleniyor(true);
    try {
      const r = await api.logFiltre(oturumId, {
        durum: durum || undefined,
        kullanici_id: kullaniciId === "" ? undefined : Number(kullaniciId),
        q: q.trim() || undefined,
        limit: PAGE,
        offset: sayfa * PAGE,
      });
      setRows(r.items);
      setToplam(r.toplam);
    } finally {
      setYukleniyor(false);
    }
  }

  useEffect(() => { setSayfa(0); }, [durum, kullaniciId, q]);
  useEffect(() => { yukle(); }, [oturumId, durum, kullaniciId, q, sayfa]);

  const maxSayfa = Math.max(0, Math.ceil(toplam / PAGE) - 1);

  async function excelIndir() {
    const b = await api.logExcel(oturumId);
    const url = URL.createObjectURL(b);
    const a = document.createElement("a"); a.href = url;
    a.download = `tarama_log_${oturumId}.xlsx`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="card overflow-hidden">
      <PanelHeader
        title="Tarama log"
        meta={`${toplam.toLocaleString("tr-TR")} kayıt`}
        action={<Button variant="secondary" size="sm" onClick={excelIndir}>Excel indir</Button>}
      />

      <div className="flex items-center gap-2 flex-wrap px-4 py-2 bg-cream/60 border-b border-edge/50">
        <select value={durum} onChange={e => setDurum(e.target.value)}
          className="text-sm px-2.5 py-1.5 rounded-[10px] border border-edge bg-field outline-none">
          <option value="">Tüm durum</option>
          {Object.entries(TARAMA_DURUM).map(([k, v]) => (
            <option key={k} value={k}>{v.label} - {k}</option>
          ))}
        </select>

        <select
          value={kullaniciId}
          onChange={e => setKullaniciId(e.target.value === "" ? "" : Number(e.target.value))}
          className="text-sm px-2.5 py-1.5 rounded-[10px] border border-edge bg-field outline-none"
        >
          <option value="">Tüm kullanıcı</option>
          {kullanicilar.map(k => (
            <option key={k.kullanici_id ?? "x"} value={k.kullanici_id ?? ""}>
              {k.ad} ({k.toplam_tarama})
            </option>
          ))}
        </select>

        <label className="relative flex items-center">
          <Search size={14} className="absolute left-2 text-ink/40" />
          <input
            value={q} onChange={e => setQ(e.target.value)}
            placeholder="seri, stok, ürün..."
            className="pl-7 pr-2 py-1.5 rounded-[10px] border border-edge bg-field placeholder:text-ink/40 text-sm w-44 outline-none focus:border-accent"
          />
        </label>
      </div>

      <div className="max-h-[520px] overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-cream sticky top-0 z-10">
            <tr className="text-left text-[11px] uppercase tracking-label text-ink/55">
              <th className="px-3 py-2">Zaman</th>
              <th className="px-3 py-2">Durum</th>
              <th className="px-3 py-2">Seri</th>
              <th className="px-3 py-2">Stok</th>
              <th className="px-3 py-2">Ürün</th>
              <th className="px-3 py-2">Kullanıcı</th>
              <th className="px-3 py-2">Açıklama</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-edge/40">
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-cream/60">
                <td className="px-3 py-1.5 font-mono text-xs whitespace-nowrap text-ink/70 tabular-nums">
                  {new Date(r.zaman).toLocaleString("tr-TR")}
                </td>
                <td className="px-3 py-1.5">
                  <StatusBadge
                    label={TARAMA_DURUM[r.durum]?.label ?? r.durum.toUpperCase()}
                    tone={TARAMA_DURUM[r.durum]?.tone ?? "neutral"}
                    className="w-11"
                  />
                </td>
                <td className="px-3 py-1.5 font-mono">{r.seri_giris}</td>
                <td className="px-3 py-1.5 font-mono text-xs">{r.stok_kodu ?? "-"}</td>
                <td className="px-3 py-1.5 max-w-[220px] truncate text-ink/80">{r.urun_adi ?? "-"}</td>
                <td className="px-3 py-1.5 text-xs text-ink/70">{r.kullanici_ad ?? "-"}</td>
                <td className="px-3 py-1.5 text-xs text-ink/60 max-w-[220px] truncate">{r.aciklama ?? "-"}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={7} className="p-6 text-center text-ink/55">
                {yukleniyor ? "Yükleniyor..." : "Eşleşen kayıt yok."}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="px-4 py-2 flex items-center gap-3 text-xs border-t border-edge/40 bg-cream/40">
        <span className="text-ink/65 font-mono">
          sayfa {sayfa + 1}/{maxSayfa + 1}
        </span>
        <div className="flex-1" />
        <Button
          variant="secondary" size="sm"
          disabled={sayfa <= 0}
          onClick={() => setSayfa(s => Math.max(0, s - 1))}
        >
          <ChevronLeft size={14} /> Önceki
        </Button>
        <Button
          variant="secondary" size="sm"
          disabled={sayfa >= maxSayfa}
          onClick={() => setSayfa(s => Math.min(maxSayfa, s + 1))}
        >
          Sonraki <ChevronRight size={14} />
        </Button>
      </div>
    </div>
  );
}
