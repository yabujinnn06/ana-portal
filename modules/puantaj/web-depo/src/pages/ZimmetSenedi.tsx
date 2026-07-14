import { useCallback, useEffect, useState } from "react";
import { FileText, FileEdit, PackageSearch, RefreshCcw } from "lucide-react";
import { api, ZimmetSenediCalisan } from "../lib/api";
import Card from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import SectionLabel from "../components/ui/SectionLabel";
import PanelHeader from "../components/ui/PanelHeader";
import { useToast } from "../lib/toast";
import { cn } from "../lib/cn";

function bugunISO() {
  const d = new Date();
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60000);
  return local.toISOString().slice(0, 10);
}

export default function ZimmetSenedi() {
  const toast = useToast();
  const [tarih, setTarih] = useState(bugunISO());
  const [calisanlar, setCalisanlar] = useState<ZimmetSenediCalisan[]>([]);
  const [secili, setSecili] = useState<Set<string>>(new Set());
  const [yukleniyor, setYukleniyor] = useState(false);
  const [olusturuluyor, setOlusturuluyor] = useState(false);
  const [bosFormIndiriliyor, setBosFormIndiriliyor] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const yenile = useCallback(async () => {
    setYukleniyor(true); setErr(null);
    try {
      const r = await api.zimmetSenediBugun(tarih);
      setCalisanlar(r.calisanlar);
      setSecili(new Set());
    } catch (e: any) {
      setErr(e.message ?? "Yükleme hatası");
      setCalisanlar([]);
    } finally {
      setYukleniyor(false);
    }
  }, [tarih]);

  useEffect(() => { yenile(); }, [yenile]);

  function secimKey(c: ZimmetSenediCalisan) {
    return c.employee_id != null ? `e:${c.employee_id}` : `u:${c.depo_user_id}`;
  }

  function toggle(id: string) {
    setSecili(s => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  function tumunuSec() { setSecili(new Set(calisanlar.map(secimKey))); }
  function secimiTemizle() { setSecili(new Set()); }

  async function olustur() {
    if (secili.size === 0 || olusturuluyor) return;
    setOlusturuluyor(true);
    try {
      const depoUserIds = Array.from(secili).filter(x => x.startsWith("u:")).map(x => Number(x.slice(2)));
      const employeeIds = Array.from(secili).filter(x => x.startsWith("e:")).map(x => Number(x.slice(2)));
      const blob = await api.zimmetSenediPdf(depoUserIds, tarih, employeeIds);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `zimmet_senedi_${tarih}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.push("ok", "Zimmet senedi indirildi");
    } catch (e: any) {
      toast.push("err", e.message ?? "PDF oluşturma hatası");
    } finally {
      setOlusturuluyor(false);
    }
  }

  async function bosFormIndir() {
    if (bosFormIndiriliyor) return;
    setBosFormIndiriliyor(true);
    try {
      const blob = await api.zimmetSenediBosForm();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "zimmet_senedi_bos_form.pdf";
      a.click();
      URL.revokeObjectURL(url);
      toast.push("ok", "Boş şablon indirildi");
    } catch (e: any) {
      toast.push("err", e.message ?? "Şablon indirme hatası");
    } finally {
      setBosFormIndiriliyor(false);
    }
  }

  const hepsiSecili = calisanlar.length > 0 && secili.size === calisanlar.length;

  return (
    <div className="max-w-2xl space-y-4">
      <header>
        <div className="text-[11px] uppercase tracking-label text-ink/55">Zimmet</div>
        <h2 className="font-display text-3xl text-accent">Zimmet Senedi</h2>
        <div className="text-sm text-ink/60 mt-1">
          Seçilen tarihte zimmet alan çalışanlar için imzalanacak zimmet senedi PDF'i oluştur.
        </div>
      </header>

      <div className="card p-5 space-y-3">
        <label className="block text-sm max-w-xs">
          <span className="text-[11px] uppercase tracking-label text-ink/55">Tarih</span>
          <input
            type="date"
            value={tarih}
            onChange={(e) => setTarih(e.target.value)}
            className="mt-1.5 w-full h-10 px-3 rounded-[10px] border border-edge bg-field focus:border-accent outline-none"
          />
        </label>
      </div>

      <div className="card overflow-hidden">
        <PanelHeader
          title="Bugün zimmet alanlar"
          meta={`${calisanlar.length} kişi`}
          action={
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={yenile}
                disabled={yukleniyor}
                className="p-1.5 rounded-md hover:bg-white/10 transition"
                title="Yenile"
              >
                <RefreshCcw size={14} className={cn(yukleniyor && "animate-spin")} />
              </button>
              <button
                onClick={tumunuSec}
                disabled={calisanlar.length === 0}
                className="px-2 py-1 rounded-md text-xs bg-white/10 hover:bg-white/20 transition disabled:opacity-50"
              >
                Tümünü seç
              </button>
              <button
                onClick={secimiTemizle}
                disabled={secili.size === 0}
                className="px-2 py-1 rounded-md text-xs bg-white/10 hover:bg-white/20 transition disabled:opacity-50"
              >
                Seçimi temizle
              </button>
            </div>
          }
        />

        {err && (
          <div className="px-4 py-3 text-sm text-bad-ink border-b border-edge/60">{err}</div>
        )}

        {calisanlar.length === 0 && !yukleniyor && !err && (
          <Card className="p-10 flex flex-col items-center text-center gap-1.5 border-0 shadow-none rounded-none">
            <PackageSearch size={32} className="text-ink/25 mb-1" />
            <div className="text-[15px] font-semibold">Bu tarih için zimmet kaydı yok.</div>
          </Card>
        )}

        {calisanlar.length > 0 && (
          <div className="max-h-[420px] overflow-auto divide-y divide-edge/50">
            {calisanlar.map((c) => {
              const key = secimKey(c);
              const checked = secili.has(key);
              return (
                <label
                  key={key}
                  className={cn(
                    "flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors",
                    checked ? "bg-deep/5" : "hover:bg-cream/60",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(key)}
                    className="h-4 w-4 rounded border-edge accent-accent"
                  />
                  <span className="text-[14px] font-medium flex-1 truncate">{c.ad}</span>
                  <span className="text-xs font-mono text-ink/55">{c.urun_sayisi} kalem</span>
                </label>
              );
            })}
          </div>
        )}
      </div>

      <SectionLabel>Çıktı</SectionLabel>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="primary"
          className="w-full sm:w-auto"
          disabled={secili.size === 0 || olusturuluyor}
          onClick={olustur}
        >
          {olusturuluyor ? (
            <>
              <RefreshCcw size={14} className="animate-spin" /> Oluşturuluyor...
            </>
          ) : (
            <>
              <FileText size={14} /> Zimmet Senedi Oluştur (PDF){secili.size > 0 ? ` · ${secili.size} kişi` : ""}
            </>
          )}
        </Button>
        <Button
          variant="secondary"
          className="w-full sm:w-auto"
          disabled={bosFormIndiriliyor}
          onClick={bosFormIndir}
          title="Elle doldurulacak, boş zimmet senedi şablonunu indir"
        >
          {bosFormIndiriliyor ? (
            <>
              <RefreshCcw size={14} className="animate-spin" /> İndiriliyor...
            </>
          ) : (
            <>
              <FileEdit size={14} /> Boş Şablon İndir (Elle Doldurulur)
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
