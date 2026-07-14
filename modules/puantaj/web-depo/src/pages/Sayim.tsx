import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Camera, Download, PowerOff, BarChart3, Archive, Trash2, Wifi, WifiOff, KeyRound, X, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, CakisanSecenek, LogSatir, Oturum, Ozet, StokOzet, Tarama } from "../lib/api";
import { connectSayimWS, SayimWS, PresenceUser, ChatMesaji, SesMesaji } from "../lib/ws";
import { sound } from "../lib/sound";
import { flash } from "../lib/flash";
import { useAuth } from "../lib/auth";
import { useToast } from "../lib/toast";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/ui/Button";
import StatusBadge, { OTURUM_DURUM } from "../components/ui/StatusBadge";
import BarkodInput from "../components/BarkodInput";
import DurumKarti from "../components/DurumKarti";
import OzetSeridi from "../components/OzetSeridi";
import StokListesi from "../components/StokListesi";
import IslemAkisi from "../components/IslemAkisi";
import KameraTarayici from "../components/KameraTarayici";
import BilinmeyenSeriPaneli from "../components/BilinmeyenSeriPaneli";
import SerbestSayimPaneli from "../components/SerbestSayimPaneli";
import StokDetayModal from "../components/StokDetayModal";
import SeriDetayModal from "../components/SeriDetayModal";
import TopluIslemler from "../components/TopluIslemler";
import PortalKarsilastirma from "../components/PortalKarsilastirma";
import PresencePanel from "../components/PresencePanel";
import TelsizBar from "../components/TelsizBar";
import CakismaModal from "../components/CakismaModal";

export default function Sayim() {
  const { id } = useParams();
  const oturumId = Number(id);
  const { user } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const [oturum, setOturum] = useState<Oturum | null>(null);
  const [ozet, setOzet] = useState<Ozet | null>(null);
  const [stoklar, setStoklar] = useState<StokOzet[]>([]);
  const [log, setLog] = useState<LogSatir[]>([]);
  const [son, setSon] = useState<Tarama | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [kameraAcik, setKameraAcik] = useState(false);
  const [wsAcik, setWsAcik] = useState(false);
  const [detayStok, setDetayStok] = useState<StokOzet | null>(null);
  const [detayLog, setDetayLog] = useState<LogSatir | null>(null);
  const [presence, setPresence] = useState<PresenceUser[]>([]);
  const [sonChat, setSonChat] = useState<ChatMesaji | SesMesaji | null>(null);
  const [wsRef, setWsRef] = useState<SayimWS | null>(null);
  const [kapatAcik, setKapatAcik] = useState(false);
  const [kapatPin, setKapatPin] = useState("");
  const [kapatBusy, setKapatBusy] = useState(false);
  const yenileRef = useRef<number | undefined>();
  const taramaBusyRef = useRef(false);

  const yenile = useCallback(async () => {
    try {
      const [o, oz, st, lg] = await Promise.all([
        api.oturum(oturumId),
        api.oturumOzet(oturumId),
        api.oturumStoklar(oturumId),
        api.oturumLog(oturumId, 80),
      ]);
      setOturum(o); setOzet(oz); setStoklar(st); setLog(lg);
    } catch (e: any) { setHata(e.message); }
  }, [oturumId]);

  const taramaDk = useMemo(() => {
    if (log.length < 2) return 0;
    const enYeni = new Date(log[0].zaman).getTime();
    const enEski = new Date(log[log.length - 1].zaman).getTime();
    const sn = (enYeni - enEski) / 1000;
    if (sn <= 0) return log.length;
    return Math.round((log.length / sn) * 60);
  }, [log]);

  useEffect(() => { yenile(); }, [yenile]);
  useEffect(() => {
    const ws: SayimWS = connectSayimWS(oturumId, (m) => {
      if (m.tip === "presence") {
        setPresence(m.kullanicilar);
        return;
      }
      if (m.tip === "chat" || m.tip === "voice") {
        setSonChat(m);
        return;
      }
      window.clearTimeout(yenileRef.current);
      yenileRef.current = window.setTimeout(yenile, 400);
    });
    ws.durum(setWsAcik);
    setWsRef(ws);
    return () => { ws.close(); setWsRef(null); };
  }, [oturumId, yenile]);

  useEffect(() => {
    if (!ozet || !oturum) return;
    document.title = `${ozet.sayilan_seri}/${ozet.toplam_seri} · ${oturum.ad} · Rainwater Sayım`;
    return () => { document.title = "Rainwater Sayım Sistemi"; };
  }, [ozet, oturum]);

  const tara = useCallback(async (
    seri: string,
    secim?: Pick<CakisanSecenek, "seri_id" | "stok_id">,
  ) => {
    if (taramaBusyRef.current) return;
    taramaBusyRef.current = true;
    setHata(null); setBusy(true);
    try {
      const r = await api.tara(oturumId, seri, secim ? {
        secilen_seri_id: secim.seri_id,
        secilen_stok_id: secim.stok_id,
      } : undefined);
      setSon(r);
      if (r.durum === "basarili") {
        sound.basarili();
        flash("good");
        if (navigator.vibrate) navigator.vibrate(40);
      } else if (r.durum === "mukerrer" || r.durum === "cakisma") {
        sound.uyari();
        flash("warn");
        if (navigator.vibrate) navigator.vibrate([20, 30, 20]);
      } else if (r.durum === "bulunamadi") {
        sound.hata();
        flash("bad");
        if (navigator.vibrate) navigator.vibrate([60, 40, 60]);
      }
    } catch (e: any) {
      setHata(e.message);
      sound.hata();
      flash("bad");
    } finally {
      taramaBusyRef.current = false;
      setBusy(false);
    }
  }, [oturumId]);

  const bilinmeyenEkle = useCallback(async (secim: {
    stokId?: number | null; yeniKod?: string; yeniAd?: string; yeniPortal?: number;
  }) => {
    if (!son || son.durum !== "bulunamadi") return;
    const seri = son.resolved_serial ?? son.seri;
    let stokId = secim.stokId ?? null;
    if (!stokId) {
      const r = await api.stokEkle(
        oturumId,
        secim.yeniKod || son.parsed_stock_code || seri,
        secim.yeniAd || "Sonradan eklendi",
        secim.yeniPortal || 0,
      );
      stokId = r.id;
      toast.push("ok", `Stok eklendi: ${r.stok_kodu}`);
    }
    try {
      await api.seriEkle(stokId, seri, true);
    } catch (e: any) {
      const msg = String(e?.message ?? "");
      if (!msg.startsWith("ONAY_GEREKLI:")) throw e;
      const uyari = msg.replace("ONAY_GEREKLI:", "").trim();
      if (!confirm(`${uyari}\nYine de eklensin mi?`)) return;
      await api.seriEkle(stokId, seri, true, true);
    }
    toast.push("ok", "Seri eklendi ve sayıldı");
    setSon(null);
    yenile();
  }, [son, oturumId, toast, yenile]);

  const aktif = oturum?.durum === "aktif";
  const serbest = oturum?.mod === "serbest";

  async function bitir() {
    const pin = kapatPin.trim();
    if (!pin) { toast.push("warn", "Devam etmek için PIN'ini gir"); return; }
    setKapatBusy(true);
    try {
      await api.oturumBitir(oturumId, pin);
      sound.kapanis();
      toast.push("ok", "Sayım oturumu kapatıldı");
      setKapatAcik(false); setKapatPin("");
      yenile();
    } catch (e: any) {
      toast.push("err", e.message);
    } finally { setKapatBusy(false); }
  }

  async function arsivle() {
    if (!confirm("Oturum arşive alınsın mı?")) return;
    try { await api.oturumArsivle(oturumId); toast.push("ok", "Arşive alındı"); yenile(); }
    catch (e: any) { toast.push("err", e.message); }
  }

  async function sil() {
    if (!confirm("Oturum kalıcı olarak silinecek. Tüm stok/seri/log veri kaybı olur. Devam edilsin mi?")) return;
    try { await api.oturumSil(oturumId); toast.push("ok", "Oturum silindi"); nav("/"); }
    catch (e: any) { toast.push("err", e.message); }
  }

  async function indir() {
    try {
      const blob = await api.excelIndir(oturumId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `sayim_${oturum?.ad ?? oturumId}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.push("ok", "Excel indirildi");
    } catch (e: any) { toast.push("err", e.message); }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "F2") {
        e.preventDefault();
        const inp = document.querySelector<HTMLInputElement>('input[placeholder*="Barkod"]');
        inp?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
    <TelsizBar ws={wsRef} son={sonChat} oturumId={oturumId} />
    <div className="space-y-5">
      <motion.header
        initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
        className="flex items-end justify-between gap-3 flex-wrap min-w-0"
      >
        <div className="flex items-start gap-2 sm:gap-3 min-w-0 flex-1 basis-full sm:basis-auto">
          <Link to="/" className="mt-1 p-2 rounded-lg border border-edge hover:bg-card transition shrink-0">
            <ArrowLeft size={16} />
          </Link>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] uppercase tracking-[0.14em] sm:tracking-[0.22em] text-ink/55">Sayım Oturumu</div>
            <h2 className="font-display text-xl sm:text-3xl leading-tight break-words">{oturum?.ad ?? "…"}</h2>
            <div className="text-sm text-ink/65 mt-1 flex items-center gap-1.5 flex-wrap">
              {oturum?.lokasyon && <span>{oturum.lokasyon}</span>}
              {oturum && (
                <StatusBadge
                  label={OTURUM_DURUM[oturum.durum]?.label ?? oturum.durum.toUpperCase()}
                  tone={OTURUM_DURUM[oturum.durum]?.tone ?? "neutral"}
                />
              )}
              {serbest && (
                <span className="inline-flex items-center gap-1 text-[11px] uppercase tracking-label px-1.5 py-0.5 rounded-md bg-flame/15 text-flame-ink border border-flame/30 font-mono font-semibold">
                  Serbest sayım
                </span>
              )}
              <span className={
                "inline-flex items-center gap-1 text-[11px] uppercase tracking-label px-1.5 py-0.5 rounded " +
                (wsAcik ? "text-good-ink" : "text-bad-ink")
              } title={wsAcik ? "Canlı bağlantı aktif" : "Canlı bağlantı yok"}>
                {wsAcik ? <Wifi size={11} /> : <WifiOff size={11} />}
                {wsAcik ? "live" : "offline"}
              </span>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Link to={`/sayim/${oturumId}/rapor`}>
            <Button variant="secondary" size="sm"><BarChart3 size={14} /> Rapor</Button>
          </Link>
          <Button variant="secondary" size="sm" onClick={indir}><Download size={14} /> Excel</Button>
          {user?.rol === "admin" && (
            <>
              {aktif && (
                <Button variant="danger" size="sm" onClick={() => { setKapatPin(""); setKapatAcik(true); }}
                  title="Sayım oturumunu sonlandır">
                  <PowerOff size={14} /> Oturumu kapat
                </Button>
              )}
              {oturum?.durum === "tamamlandi" && (
                <Button variant="secondary" size="sm" onClick={arsivle}><Archive size={14} /> Arşivle</Button>
              )}
              <Button variant="quiet" size="sm" onClick={sil} title="Oturumu kalıcı sil" className="text-bad-ink">
                <Trash2 size={14} />
              </Button>
            </>
          )}
        </div>
      </motion.header>

      {ozet && <OzetSeridi ozet={ozet} taramaDk={taramaDk} />}

      <div className="grid lg:grid-cols-12 gap-4 min-w-0">
        <div className="lg:col-span-7 space-y-4 min-w-0">
          {serbest ? (
            <SerbestSayimPaneli
              oturumId={oturumId}
              stoklar={stoklar}
              aktif={!!aktif}
              onDegisti={yenile}
              ws={wsRef}
              sonChat={sonChat}
            />
          ) : (
            <div className="card p-4 space-y-3">
              <BarkodInput onSubmit={tara} aktif={aktif} busy={busy} pauseFocus={kameraAcik} />
              {hata && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className="text-bad-ink text-sm font-mono">
                  ! {hata}
                </motion.div>
              )}
              <DurumKarti son={son} />
              {son?.durum === "bulunamadi" && aktif && (
                <BilinmeyenSeriPaneli
                  oturumId={oturumId}
                  seri={son.resolved_serial ?? son.seri}
                  rawSeri={son.raw_input ?? son.raw_seri ?? son.seri}
                  parsedStockCode={son.parsed_stock_code}
                  stoklar={stoklar}
                  onBitti={() => { setSon(null); yenile(); }}
                />
              )}
            </div>
          )}

          <StokListesi
            rows={stoklar}
            onSec={setDetayStok}
            bosMesaj={serbest ? "Henüz sayım yok. Yukarıdan stok kodu gir, sonra barkod okutmaya başla." : undefined}
          />

          {!serbest && (
            <div className="card overflow-hidden">
              <button
                onClick={() => setKameraAcik(v => !v)}
                className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-cream/60 transition-colors"
              >
                <span className="flex items-center gap-2 text-sm font-medium">
                  <Camera size={16} className="text-ink/50" /> Kamera tarama
                </span>
                {kameraAcik ? <ChevronUp size={16} className="text-ink/40" /> : <ChevronDown size={16} className="text-ink/40" />}
              </button>
              {kameraAcik && (
                <div className="p-3 border-t border-edge/50">
                  <KameraTarayici
                    onKod={tara} sonuc={son} ozet={ozet} ws={wsRef} sonChat={sonChat} oturumId={oturumId}
                    stoklar={stoklar} onBilinmeyenEkle={bilinmeyenEkle}
                  />
                </div>
              )}
            </div>
          )}

          {!serbest && (
          <TopluIslemler
              oturumId={oturumId}
              aktif={!!aktif}
              onDegisti={yenile}
            />
          )}
        </div>
        <div className="lg:col-span-5 space-y-4 lg:sticky lg:top-[72px] self-start min-w-0">
          <IslemAkisi rows={log} oturumId={oturumId} stoklar={stoklar} onSec={setDetayLog} />
          <PresencePanel rows={presence} benimId={user?.id ?? null} />
          {ozet && <PortalKarsilastirma ozet={ozet} stoklar={stoklar} />}
        </div>
      </div>
      <StokDetayModal
        stokId={detayStok?.id ?? null}
        stokKodu={detayStok?.stok_kodu}
        urunAdi={detayStok?.urun_adi}
        portalSayim={detayStok?.portal_sayim}
        onClose={() => setDetayStok(null)}
      />
      <SeriDetayModal row={detayLog} onClose={() => setDetayLog(null)} />
      <CakismaModal
        sonuc={son}
        busy={busy}
        onClose={() => setSon(null)}
        onSec={secenek => {
          const raw = son?.raw_input ?? son?.raw_seri ?? son?.seri ?? "";
          tara(raw, secenek);
        }}
      />

      <AnimatePresence>
        {kapatAcik && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => !kapatBusy && setKapatAcik(false)}
            className="fixed inset-0 z-[70] bg-deep/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-3"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.15 }}
              onClick={e => e.stopPropagation()}
              className="card shadow-e2 w-full max-w-sm p-5 space-y-4"
            >
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-xl bg-bad/15 text-bad-ink flex items-center justify-center shrink-0">
                  <PowerOff size={20} />
                </div>
                <div className="min-w-0">
                  <div className="font-display text-lg leading-tight">Sayım oturumunu kapat</div>
                  <div className="text-sm text-ink/65 mt-0.5 truncate">{oturum?.ad}</div>
                </div>
                <button onClick={() => setKapatAcik(false)} disabled={kapatBusy}
                  className="ml-auto p-2 -mr-1 rounded-md hover:bg-edge/30" title="Vazgeç">
                  <X size={16} />
                </button>
              </div>

              <div className="flex gap-2 text-sm text-ink/75 bg-warn/10 border border-warn/30 rounded-lg p-3">
                <AlertTriangle size={16} className="text-warn-ink shrink-0 mt-0.5" />
                <div>
                  Bu buton <b>ekranı kapatmaz</b>. Sayım oturumunu <b>sonlandırır</b>; kapandıktan
                  sonra bu oturumda yeni tarama yapılamaz. Devam etmek için kendi <b>PIN</b>'ini gir.
                </div>
              </div>

              <form onSubmit={e => { e.preventDefault(); bitir(); }}>
                <label className="block">
                  <span className="text-[11px] uppercase tracking-label text-ink/60">PIN</span>
                  <div className="mt-1.5 relative">
                    <KeyRound size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/40" />
                    <input type="password" autoFocus autoComplete="off"
                      value={kapatPin} onChange={e => setKapatPin(e.target.value)}
                      className="w-full pl-9 pr-3 py-2.5 rounded-[10px] border border-edge bg-field focus:border-accent outline-none" />
                  </div>
                </label>
                <div className="flex gap-2 mt-4">
                  <Button type="button" variant="secondary" onClick={() => setKapatAcik(false)} disabled={kapatBusy} className="flex-1">
                    Vazgeç
                  </Button>
                  <Button type="submit" variant="danger" disabled={kapatBusy} className="flex-1">
                    <PowerOff size={14} /> {kapatBusy ? "Kapatılıyor..." : "Oturumu kapat"}
                  </Button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
    </>
  );
}
