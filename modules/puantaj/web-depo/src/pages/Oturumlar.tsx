import { Plus, MapPin, PackageSearch, ArrowRight, BarChart3, ScanLine, ListPlus, Warehouse } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, Depo, Oturum } from "../lib/api";
import { useAuth } from "../lib/auth";
import { cn } from "../lib/cn";
import Card from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import StatusBadge, { OTURUM_DURUM } from "../components/ui/StatusBadge";

export default function Oturumlar() {
  const { user } = useAuth();
  const [list, setList] = useState<Oturum[]>([]);
  const [ad, setAd] = useState("");
  const [lokasyon, setLokasyon] = useState("");
  const [mod, setMod] = useState<"seri" | "serbest">("seri");
  const [depolar, setDepolar] = useState<Depo[]>([]);
  const [secDepoId, setSecDepoId] = useState<number | "">("");
  const [depoAd, setDepoAd] = useState("");
  const [depoLokasyon, setDepoLokasyon] = useState("");
  const [depoBusy, setDepoBusy] = useState(false);
  const [depoErr, setDepoErr] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() { setList(await api.oturumlar()); }
  async function refreshDepolar() { setDepolar(await api.depolar()); }
  useEffect(() => { refresh(); if (user?.rol === "admin") refreshDepolar(); }, [user]);

  async function yeni() {
    setErr(null);
    if (!ad.trim()) { setErr("Ad boş olamaz"); return; }
    if (!secDepoId) { setErr("Sayım için depo seçmelisin"); return; }
    setBusy(true);
    try {
      await api.yeniOturum(ad, lokasyon, mod, Number(secDepoId));
      setAd(""); setLokasyon(""); setMod("seri"); setSecDepoId("");
      refresh();
    }
    catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }

  async function depoOlustur() {
    setDepoErr(null);
    if (!depoAd.trim()) { setDepoErr("Depo adı boş olamaz"); return; }
    setDepoBusy(true);
    try {
      const d = await api.yeniDepo(depoAd, depoLokasyon);
      setDepoAd(""); setDepoLokasyon("");
      await refreshDepolar();
      setSecDepoId(d.id);
    }
    catch (e: any) { setDepoErr(e.message); }
    finally { setDepoBusy(false); }
  }

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      <section className="lg:col-span-2 space-y-3">
        <header>
          <div className="text-[11px] uppercase tracking-label text-ink/55">Aktif işlemler</div>
          <h2 className="font-display text-3xl text-accent">Sayım oturumları</h2>
        </header>
        <div className="space-y-2">
          {list.length === 0 && (
            <Card className="p-10 flex flex-col items-center text-center gap-1.5">
              <PackageSearch size={32} className="text-ink/25 mb-1" />
              <div className="text-[15px] font-semibold">Henüz sayım oturumu yok</div>
              {user?.rol === "admin" && (
                <div className="text-[13px] text-ink/55">İlk oturumu sağdaki formdan oluştur</div>
              )}
            </Card>
          )}
          {list.map((o) => {
            const aktif = o.durum === "aktif";
            return (
              <Card key={o.id} className="hover:border-accent/40 hover:bg-cream/40 transition-colors">
                <div className="relative p-4 group">
                  <Link
                    to={`/sayim/${o.id}`}
                    aria-label={`${o.ad} sayımını aç`}
                    className="absolute inset-0 z-0"
                  />
                  <div className="relative z-[1] pointer-events-none flex items-center gap-3">
                    <span className={cn("h-2 w-2 rounded-full shrink-0", aktif ? "bg-good" : "bg-edge")} />
                    <div className="min-w-0 flex-1">
                      <div className="text-[15px] font-semibold truncate">{o.ad}</div>
                      <div className="text-xs text-ink/60 mt-0.5 flex items-center gap-3 flex-wrap">
                        {o.lokasyon && (
                          <span className="inline-flex items-center gap-1">
                            <MapPin size={12} />{o.lokasyon}
                          </span>
                        )}
                        <span className="font-mono">
                          {new Date(o.baslangic).toLocaleString("tr-TR")}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {o.mod === "serbest" && (
                        <span className="hidden sm:inline-flex items-center gap-1 text-[11px] uppercase tracking-label px-1.5 py-0.5 rounded-md bg-flame/15 text-flame-ink border border-flame/30 font-mono font-semibold">
                          <ListPlus size={11} /> Serbest
                        </span>
                      )}
                      <Link
                        to={`/sayim/${o.id}/rapor`}
                        onClick={(e) => e.stopPropagation()}
                        title="Rapor"
                        className="relative z-10 pointer-events-auto p-1.5 rounded-md text-ink/55 hover:text-accent hover:bg-edge/30 transition-colors"
                      >
                        <BarChart3 size={14} />
                      </Link>
                      <StatusBadge
                        label={OTURUM_DURUM[o.durum]?.label ?? o.durum.toUpperCase()}
                        tone={OTURUM_DURUM[o.durum]?.tone ?? "neutral"}
                      />
                      <ArrowRight size={16} className="text-ink/40 group-hover:translate-x-1 group-hover:text-accent transition-transform" />
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </section>

      {user?.rol === "admin" && (
        <aside className="space-y-4 h-fit lg:sticky lg:top-20">
        <div className="card p-5 space-y-3">
          <h3 className="text-[15px] font-semibold flex items-center gap-2">
            <Warehouse size={16} className="text-accent" /> Depolar
          </h3>
          {depolar.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {depolar.map(d => (
                <span key={d.id} className="text-xs font-mono bg-edge/25 px-2 py-1 rounded-md">
                  {d.ad}{d.lokasyon ? ` · ${d.lokasyon}` : ""}
                </span>
              ))}
            </div>
          ) : (
            <div className="text-[13px] text-ink/55">Henüz depo yok. Serbest sayım için önce bir depo oluştur.</div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-[1.2fr_1fr_auto] gap-1.5">
            <input className="h-9 px-2.5 rounded-lg border border-edge bg-field text-sm focus:border-accent outline-none min-w-0"
              value={depoAd} onChange={e => setDepoAd(e.target.value)} placeholder="Depo adı" />
            <input className="h-9 px-2.5 rounded-lg border border-edge bg-field text-sm focus:border-accent outline-none min-w-0"
              value={depoLokasyon} onChange={e => setDepoLokasyon(e.target.value)} placeholder="Lokasyon" />
            <Button type="button" variant="secondary" size="sm" onClick={depoOlustur} disabled={depoBusy} className="w-full sm:w-auto">
              <Plus size={14} /> <span className="sm:hidden">Depo ekle</span>
            </Button>
          </div>
          {depoErr && <div className="text-bad-ink text-sm">{depoErr}</div>}
        </div>
        <div className="card p-5 space-y-3">
          <h3 className="text-[15px] font-semibold flex items-center gap-2">
            <Plus size={16} className="text-accent" /> Yeni oturum
          </h3>
          <label className="block text-sm">
            <span className="text-[11px] uppercase tracking-label text-ink/55">Ad</span>
            <input className="mt-1.5 w-full h-10 px-3 rounded-[10px] border border-edge bg-field focus:border-accent outline-none"
              value={ad} onChange={(e) => setAd(e.target.value)} placeholder="2026-05 Ankara" />
          </label>
          <label className="block text-sm">
            <span className="text-[11px] uppercase tracking-label text-ink/55">Lokasyon</span>
            <input className="mt-1.5 w-full h-10 px-3 rounded-[10px] border border-edge bg-field focus:border-accent outline-none"
              value={lokasyon} onChange={(e) => setLokasyon(e.target.value)} placeholder="Ankara depo" />
          </label>
          <div className="block text-sm">
            <span className="text-[11px] uppercase tracking-label text-ink/55">Sayım tipi</span>
            <div className="mt-1.5 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMod("seri")}
                className={cn(
                  "flex flex-col items-start gap-1 rounded-[10px] border-2 p-2.5 text-left transition-colors",
                  mod === "seri" ? "border-accent bg-deep/5" : "border-edge hover:bg-cream/60"
                )}
              >
                <span className="flex items-center gap-1.5 text-[13px] font-semibold">
                  <ScanLine size={14} className={mod === "seri" ? "text-accent" : "text-ink/45"} /> Barkod/Seri
                </span>
                <span className="text-[11px] text-ink/55 leading-snug">Excel yükle, seri bazlı say</span>
              </button>
              <button
                type="button"
                onClick={() => setMod("serbest")}
                className={cn(
                  "flex flex-col items-start gap-1 rounded-[10px] border-2 p-2.5 text-left transition-colors",
                  mod === "serbest" ? "border-flame bg-flame/5" : "border-edge hover:bg-cream/60"
                )}
              >
                <span className="flex items-center gap-1.5 text-[13px] font-semibold">
                  <ListPlus size={14} className={mod === "serbest" ? "text-flame-ink" : "text-ink/45"} /> Serbest
                </span>
                <span className="text-[11px] text-ink/55 leading-snug">Excel'siz, stok seç + barkod okut</span>
              </button>
            </div>
          </div>
          <label className="block text-sm">
            <span className="text-[11px] uppercase tracking-label text-ink/55">Depo</span>
            <select
              className="mt-1.5 w-full h-10 px-3 rounded-[10px] border border-edge bg-field focus:border-accent outline-none"
              value={secDepoId}
              onChange={(e) => setSecDepoId(e.target.value ? Number(e.target.value) : "")}
            >
              <option value="">— depo seç —</option>
              {depolar.map(d => (
                <option key={d.id} value={d.id}>{d.ad}{d.lokasyon ? ` · ${d.lokasyon}` : ""}</option>
              ))}
            </select>
            {depolar.length === 0 && (
              <span className="text-[11px] text-warn-ink mt-1 block">Önce yukarıdan bir depo oluştur.</span>
            )}
          </label>
          {err && <div className="text-bad-ink text-sm">{err}</div>}
          <Button
            type="button"
            variant="primary"
            onClick={yeni}
            disabled={busy}
            className="w-full"
          >
            {busy ? "Oluşturuluyor..." : "Oluştur"}
          </Button>
        </div>
        </aside>
      )}
    </div>
  );
}
