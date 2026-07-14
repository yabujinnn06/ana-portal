import { FormEvent, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ScanLine, ArrowLeftRight, Undo2, CheckCircle2, AlertTriangle, XCircle, Camera, ChevronDown, ChevronUp } from "lucide-react";
import { api, StokOzet, Tarama } from "../lib/api";
import { useToast } from "../lib/toast";
import { sound } from "../lib/sound";
import { flash } from "../lib/flash";
import { cn } from "../lib/cn";
import { Button } from "./ui/Button";
import KameraTarayici from "./KameraTarayici";
import { ChatMesaji, SayimWS, SesMesaji } from "../lib/ws";

type AktifStok = { id: number; kod: string; ad: string };
type Okunan = { key: number; seriId: number; seriNo: string };
type Durum = "basarili" | "mukerrer" | "hata";

type Props = {
  oturumId: number;
  stoklar: StokOzet[];
  aktif: boolean;
  onDegisti: () => void;
  ws?: SayimWS | null;
  sonChat?: ChatMesaji | SesMesaji | null;
};

export default function SerbestSayimPaneli({ oturumId, stoklar, aktif, onDegisti, ws, sonChat }: Props) {
  const toast = useToast();
  const [aktifStok, setAktifStok] = useState<AktifStok | null>(null);
  const [kod, setKod] = useState("");
  const [ad, setAd] = useState("");
  const [seri, setSeri] = useState("");
  const [busy, setBusy] = useState(false);
  const [durum, setDurum] = useState<Durum | null>(null);
  const [mesaj, setMesaj] = useState("");
  const [okunanlar, setOkunanlar] = useState<Okunan[]>([]);
  const [kameraAcik, setKameraAcik] = useState(false);
  const [kameraSonuc, setKameraSonuc] = useState<Tarama | null>(null);
  const bekleyenSupheli = useRef<string | null>(null);
  const kodRef = useRef<HTMLInputElement>(null);
  const seriRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!aktif) return;
    (aktifStok ? seriRef : kodRef).current?.focus({ preventScroll: true });
  }, [aktif, aktifStok]);

  const aktifStokOzet = stoklar.find((s) => s.id === aktifStok?.id);
  const stokSayisi = aktifStokOzet?.sayilan ?? 0;
  const depoMiktar = aktifStokOzet?.depo_miktar;

  async function stogaGec(k: string, a: string) {
    if (!k || !aktif) return;
    setBusy(true);
    try {
      const r = await api.stokEkle(oturumId, k, a || k);
      setAktifStok({ id: r.id, kod: r.stok_kodu, ad: r.urun_adi });
      sound.gecis();
      setKod("");
      setAd("");
      setDurum(null);
      setOkunanlar([]);
      bekleyenSupheli.current = null;
      setKameraSonuc(null);
      onDegisti();
    } catch (err: any) {
      toast.push("err", err.message);
      throw err;
    } finally {
      setBusy(false);
    }
  }

  async function stogaBasla(e?: FormEvent) {
    e?.preventDefault();
    const k = kod.trim();
    if (!k || busy) return;
    await stogaGec(k, ad.trim()).catch(() => {});
  }

  function stoktanSec(s: StokOzet) {
    setAktifStok({ id: s.id, kod: s.stok_kodu, ad: s.urun_adi });
    sound.gecis();
    setDurum(null);
    setOkunanlar([]);
    bekleyenSupheli.current = null;
    setKameraSonuc(null);
  }

  function degistir() {
    setAktifStok(null);
    sound.gecis();
    setDurum(null);
    setMesaj("");
    bekleyenSupheli.current = null;
    setKameraSonuc(null);
  }

  function kameraBildir(sNo: string, durum: Tarama["durum"], mesaj: string, extra?: Partial<Tarama>) {
    setKameraSonuc({ durum, mesaj, seri: sNo, raw_input: sNo, ...extra });
  }

  async function seriGonder(sNoRaw: string) {
    const sNo = sNoRaw.trim();
    if (!sNo || busy || !aktif || !aktifStok) return;
    const supheliOnayli = bekleyenSupheli.current === sNo;
    setBusy(true);
    try {
      const r = await api.seriEkle(aktifStok.id, sNo, true, false, supheliOnayli);
      bekleyenSupheli.current = null;
      basariliOku(r, sNo);
    } catch (err: any) {
      const msg = String(err?.message ?? "");
      if (msg.startsWith("TEKRAR_OKUT:")) {
        const uyari = msg.replace("TEKRAR_OKUT:", "").trim();
        bekleyenSupheli.current = sNo;
        setDurum("mukerrer");
        setMesaj(`${uyari} (aynı barkodu tekrar okut)`);
        kameraBildir(sNo, "mukerrer", `${uyari} — aynı barkodu tekrar okut`);
        sound.uyari();
        flash("warn");
        if (navigator.vibrate) navigator.vibrate([20, 30, 20]);
        setSeri("");
      } else if (msg.startsWith("ONAY_GEREKLI:")) {
        const uyari = msg.replace("ONAY_GEREKLI:", "").trim();
        if (confirm(`${uyari}\nYine de eklensin mi?`)) {
          try {
            const r = await api.seriEkle(aktifStok.id, sNo, true, true);
            basariliOku(r, sNo);
          } catch (e2: any) {
            hataGoster(e2.message, sNo);
          }
        } else {
          kameraBildir(sNo, "cakisma", uyari);
        }
      } else if (msg.toLowerCase().includes("zaten kay")) {
        setDurum("mukerrer");
        setMesaj(`Bu seri zaten sayılmış: ${sNo}`);
        kameraBildir(sNo, "mukerrer", `Bu seri zaten sayılmış: ${sNo}`);
        sound.uyari();
        flash("warn");
        if (navigator.vibrate) navigator.vibrate([20, 30, 20]);
        setSeri("");
      } else {
        hataGoster(msg, sNo);
      }
    } finally {
      setBusy(false);
      seriRef.current?.focus({ preventScroll: true });
    }
  }

  function oku(e?: FormEvent) {
    e?.preventDefault();
    seriGonder(seri);
  }

  function basariliOku(r: any, sNo?: string) {
    setDurum("basarili");
    setMesaj(`Sayıldı: ${r.seri_no}`);
    kameraBildir(sNo ?? r.seri_no, "basarili", `Sayıldı: ${r.seri_no}`, { seri: r.seri_no });
    sound.basarili();
    flash("good");
    if (navigator.vibrate) navigator.vibrate(40);
    setOkunanlar((l) => [{ key: Date.now(), seriId: r.id, seriNo: r.seri_no }, ...l].slice(0, 12));
    setSeri("");
    onDegisti();
  }

  function hataGoster(msg: string, sNo?: string) {
    setDurum("hata");
    setMesaj(msg);
    if (sNo) kameraBildir(sNo, "bulunamadi", msg);
    sound.hata();
    flash("bad");
    if (navigator.vibrate) navigator.vibrate([60, 40, 60]);
  }

  async function geriAl(o: Okunan) {
    try {
      await api.seriSil(o.seriId);
      sound.geriAl();
      toast.push("ok", `${o.seriNo} geri alındı`);
      setOkunanlar((l) => l.filter((x) => x.key !== o.key));
      onDegisti();
    } catch (err: any) {
      toast.push("err", err.message);
    }
  }

  const gecmisStoklar = stoklar.filter((s) => s.id !== aktifStok?.id).slice(0, 8);

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center gap-2.5">
        <span className="h-8 w-8 rounded-lg bg-flame/15 text-flame-ink flex items-center justify-center shrink-0">
          <ScanLine size={16} />
        </span>
        <div className="min-w-0">
          <div className="text-sm font-semibold leading-tight">Serbest Sayım</div>
          <div className="text-[11px] text-ink/55 leading-tight">
            Excel gerekmez — stok seç, barkod okut, bitince stok değiştir
          </div>
        </div>
      </div>

      {!aktifStok ? (
        <>
          <form onSubmit={stogaBasla} className="grid sm:grid-cols-[1.2fr_1.6fr_auto] gap-2">
            <input
              ref={kodRef}
              value={kod}
              onChange={(e) => setKod(e.target.value)}
              placeholder="Stok kodu"
              disabled={!aktif}
              autoComplete="off"
              spellCheck={false}
              className="px-3 py-2.5 rounded-lg border-2 border-edge focus:border-accent bg-field text-sm font-mono outline-none transition-colors disabled:opacity-50"
            />
            <input
              value={ad}
              onChange={(e) => setAd(e.target.value)}
              placeholder="Ürün adı (yeniyse)"
              disabled={!aktif}
              autoComplete="off"
              className="px-3 py-2.5 rounded-lg border-2 border-edge focus:border-accent bg-field text-sm outline-none transition-colors disabled:opacity-50"
            />
            <Button type="submit" variant="accent" disabled={!aktif || busy || !kod.trim()}>
              Stoğa başla
            </Button>
          </form>
          {gecmisStoklar.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {gecmisStoklar.map((s) => (
                <button
                  key={s.id}
                  onClick={() => stoktanSec(s)}
                  className="text-xs font-mono bg-edge/25 hover:bg-edge/50 px-2 py-1 rounded-md transition-colors"
                >
                  {s.stok_kodu} <span className="text-ink/50">({s.sayilan})</span>
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-flame/30 bg-flame/5 px-3 py-2">
            <div className="min-w-0 flex-1 basis-full sm:basis-auto">
              <div className="text-[10px] uppercase tracking-label text-ink/50">Aktif stok</div>
              <div className="text-sm font-semibold truncate">
                <span className="font-mono text-flame-ink">{aktifStok.kod}</span> — {aktifStok.ad}
              </div>
            </div>
            <div className="flex items-center gap-2 ml-auto sm:ml-0">
              <div className="text-right shrink-0">
                <div className="font-mono font-bold text-lg leading-none">{stokSayisi}</div>
                <div className="text-[10px] uppercase tracking-label text-ink/50">sayıldı</div>
              </div>
              {depoMiktar != null && (
                <div className="text-right shrink-0 pl-2 border-l border-flame/25">
                  <div className="font-mono font-bold text-lg leading-none">{depoMiktar}</div>
                  <div className="text-[10px] uppercase tracking-label text-ink/50">depoda</div>
                </div>
              )}
              <button
                onClick={degistir}
                title="Stoğu değiştir"
                className="p-2 rounded-md hover:bg-flame/15 text-flame-ink shrink-0 transition-colors"
              >
                <ArrowLeftRight size={16} />
              </button>
            </div>
          </div>

          <form onSubmit={oku}>
            <div className="flex items-stretch overflow-hidden rounded-xl bg-card border-2 border-accent shadow-e1 transition-colors duration-150">
              <div className="pl-4 flex items-center pointer-events-none">
                <ScanLine size={20} className="text-accent" />
              </div>
              <input
                ref={seriRef}
                value={seri}
                onChange={(e) => setSeri(e.target.value)}
                placeholder="Seri numarası okut"
                autoComplete="off"
                spellCheck={false}
                disabled={!aktif}
                className="flex-1 px-4 py-3.5 text-xl font-mono tracking-wider bg-transparent outline-none placeholder:text-ink/35"
              />
              <Button
                type="submit"
                variant="accent"
                disabled={!aktif || busy || !seri.trim()}
                className="h-auto px-7 tracking-wider rounded-none"
              >
                OKU
              </Button>
            </div>
          </form>

          <div className="rounded-lg border border-edge/60 overflow-hidden">
            <button
              onClick={() => setKameraAcik(v => !v)}
              disabled={!aktif}
              className="w-full flex items-center justify-between px-3 py-2 hover:bg-cream/60 transition-colors disabled:opacity-50"
            >
              <span className="flex items-center gap-2 text-sm font-medium">
                <Camera size={16} className="text-ink/50" /> Kamera tarama
              </span>
              {kameraAcik ? <ChevronUp size={16} className="text-ink/40" /> : <ChevronDown size={16} className="text-ink/40" />}
            </button>
            {kameraAcik && (
              <div className="p-2.5 border-t border-edge/50">
                <KameraTarayici
                  onKod={seriGonder} sonuc={kameraSonuc} ws={ws} sonChat={sonChat} oturumId={oturumId}
                  aktifStok={aktifStok} stoklar={stoklar}
                  onStokBaslat={stogaGec} onStoktanSec={stoktanSec}
                />
              </div>
            )}
          </div>

          {durum && (
            <div
              className={cn(
                "flex items-center gap-2 text-sm rounded-lg px-3 py-2",
                durum === "basarili" && "bg-good/10 text-good-ink",
                durum === "mukerrer" && "bg-warn/10 text-warn-ink",
                durum === "hata" && "bg-bad/10 text-bad-ink"
              )}
            >
              {durum === "basarili" && <CheckCircle2 size={15} className="shrink-0" />}
              {durum === "mukerrer" && <AlertTriangle size={15} className="shrink-0" />}
              {durum === "hata" && <XCircle size={15} className="shrink-0" />}
              <span className="truncate">{mesaj}</span>
            </div>
          )}

          <AnimatePresence initial={false}>
            {okunanlar.length > 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-0.5 pt-2 border-t border-edge/50 max-h-52 overflow-auto"
              >
                {okunanlar.map((o) => (
                  <motion.div
                    key={o.key}
                    layout
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0 }}
                    className="flex items-center gap-2 text-sm py-1"
                  >
                    <CheckCircle2 size={13} className="text-good-ink shrink-0" />
                    <span className="font-mono truncate flex-1">{o.seriNo}</span>
                    <button
                      onClick={() => geriAl(o)}
                      title="Geri al"
                      className="p-1 rounded-md text-ink/40 hover:text-bad-ink hover:bg-bad/10 transition-colors shrink-0"
                    >
                      <Undo2 size={14} />
                    </button>
                  </motion.div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </div>
  );
}
