import { ArrowLeft, ScanLine, Download, RefreshCcw, FileSpreadsheet, Clock } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, EksikGrup, Istatistik, Oturum, Ozet } from "../lib/api";
import { Button } from "../components/ui/Button";
import SectionLabel from "../components/ui/SectionLabel";
import StatusBadge, { OTURUM_DURUM } from "../components/ui/StatusBadge";
import ProgressBar from "../components/ui/ProgressBar";
import StatCard from "../components/StatCard";
import DurumDonut from "../components/rapor/DurumDonut";
import KullaniciKartlari from "../components/rapor/KullaniciKartlari";
import HizChart from "../components/rapor/HizChart";
import EksikListe from "../components/rapor/EksikListe";
import LogTablo from "../components/rapor/LogTablo";
import { useToast } from "../lib/toast";
import { cn } from "../lib/cn";

export default function Rapor() {
  const { id } = useParams();
  const oturumId = Number(id);
  const toast = useToast();
  const [oturum, setOturum] = useState<Oturum | null>(null);
  const [ozet, setOzet] = useState<Ozet | null>(null);
  const [stat, setStat] = useState<Istatistik | null>(null);
  const [eksik, setEksik] = useState<EksikGrup[]>([]);
  const [yenileniyor, setYenileniyor] = useState(false);
  const [sonYenileme, setSonYenileme] = useState<Date | null>(null);

  const yenile = useCallback(async () => {
    setYenileniyor(true);
    try {
      const [o, oz, st, ek] = await Promise.all([
        api.oturum(oturumId),
        api.oturumOzet(oturumId),
        api.istatistik(oturumId),
        api.eksik(oturumId),
      ]);
      setOturum(o); setOzet(oz); setStat(st); setEksik(ek);
      setSonYenileme(new Date());
    } finally {
      setYenileniyor(false);
    }
  }, [oturumId]);

  useEffect(() => { yenile(); }, [yenile]);
  useEffect(() => {
    let t: number | undefined;
    function plan() {
      window.clearInterval(t);
      if (document.visibilityState === "visible") {
        t = window.setInterval(yenile, 15_000);
      }
    }
    plan();
    document.addEventListener("visibilitychange", plan);
    return () => { window.clearInterval(t); document.removeEventListener("visibilitychange", plan); };
  }, [yenile]);

  function indir(blobP: Promise<Blob>, dosya: string) {
    blobP.then(blob => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url;
      a.download = dosya;
      a.click();
      URL.revokeObjectURL(url);
      toast.push("ok", `${dosya} indirildi`);
    }).catch(e => toast.push("err", e.message ?? "İndirme hatası"));
  }

  const yuzde = ozet && ozet.toplam_seri > 0 ? Math.round((ozet.sayilan_seri / ozet.toplam_seri) * 100) : 0;
  const fark = ozet?.portal_fark ?? 0;

  return (
    <div className="space-y-5">
      <header className="flex items-end justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-3 min-w-0">
          <Link to="/" className="mt-1 p-2 rounded-lg border border-edge hover:bg-card transition shrink-0">
            <ArrowLeft size={16} />
          </Link>
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-label text-ink/55">Rapor</div>
            <h2 className="font-display text-3xl leading-tight break-words">{oturum?.ad ?? "…"}</h2>
            <div className="text-sm text-ink/65 mt-1 flex items-center gap-2 flex-wrap">
              {oturum?.lokasyon && <span>{oturum.lokasyon}</span>}
              {oturum && (
                <StatusBadge
                  label={OTURUM_DURUM[oturum.durum]?.label ?? oturum.durum.toUpperCase()}
                  tone={OTURUM_DURUM[oturum.durum]?.tone ?? "neutral"}
                />
              )}
              {sonYenileme && (
                <span className="inline-flex items-center gap-1 text-[11px] text-ink/50 font-mono">
                  <Clock size={11} />
                  {sonYenileme.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                  <span className="normal-case">· 15sn'de bir yenilenir</span>
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="quiet" size="sm" onClick={yenile} disabled={yenileniyor} title="Şimdi yenile">
            <RefreshCcw size={14} className={cn(yenileniyor && "animate-spin")} />
          </Button>
          <Link to={`/sayim/${oturumId}`}>
            <Button variant="secondary" size="sm"><ScanLine size={14} /> Tarama ekranı</Button>
          </Link>
          <Button variant="secondary" size="sm"
            onClick={() => indir(api.logExcel(oturumId), `sayim_log_${oturum?.ad ?? oturumId}.xlsx`)}>
            <FileSpreadsheet size={14} /> Log Excel
          </Button>
          <Button variant="primary" size="sm"
            onClick={() => indir(api.excelIndir(oturumId), `sayim_${oturum?.ad ?? oturumId}.xlsx`)}>
            <Download size={14} /> Sayım Excel
          </Button>
        </div>
      </header>

      {ozet && (
        <div className="card px-5 py-4">
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <div className="text-[11px] uppercase tracking-label text-ink/55">Genel ilerleme</div>
            <div className="font-mono text-sm font-bold text-ink/75">
              {ozet.sayilan_seri.toLocaleString("tr-TR")}/{ozet.toplam_seri.toLocaleString("tr-TR")} seri · %{yuzde}
            </div>
          </div>
          <div className="mt-2">
            <ProgressBar value={ozet.sayilan_seri} max={ozet.toplam_seri || 1} tone={yuzde >= 100 ? "good" : "accent"} height={10} />
          </div>
          {ozet.son_islem && (
            <div className="mt-2 text-[11px] text-ink/50 font-mono">
              son işlem: {new Date(ozet.son_islem).toLocaleString("tr-TR")}
            </div>
          )}
        </div>
      )}

      {ozet && (
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
          <StatCard etiket="Stok" deger={ozet.stok_sayisi} tone="deep" />
          <StatCard etiket="Toplam Seri" deger={ozet.toplam_seri} tone="deep" />
          <StatCard etiket="Sayılan" deger={ozet.sayilan_seri} toplam={ozet.toplam_seri} tone="good" />
          <StatCard etiket="Kalan" deger={ozet.kalan_seri} toplam={ozet.toplam_seri} tone="warn" />
          <StatCard etiket="Portal Toplam" deger={ozet.portal_toplam} tone="accent" />
          <StatCard etiket="Portal Fark" deger={fark} tone={fark === 0 ? "good" : "warn"}
            hint={fark === 0 ? "portal ile birebir" : fark > 0 ? "portaldan fazla sayıldı" : "portaldan az sayıldı"} />
        </div>
      )}

      {stat && (
        <div className="grid lg:grid-cols-2 gap-4">
          <DurumDonut data={stat.durum_dagilimi} />
          <HizChart rows={stat.dakika_serisi} hiz={stat.tarama_dakika_dk} />
        </div>
      )}

      {stat && (
        <section>
          <SectionLabel>Kullanıcı başına</SectionLabel>
          <KullaniciKartlari rows={stat.kullanici_basina} />
        </section>
      )}

      <section>
        <SectionLabel>Tarama log</SectionLabel>
        <LogTablo oturumId={oturumId} kullanicilar={stat?.kullanici_basina ?? []} />
      </section>

      <section>
        <SectionLabel>Eksik analizi</SectionLabel>
        <EksikListe rows={eksik} />
      </section>
    </div>
  );
}
