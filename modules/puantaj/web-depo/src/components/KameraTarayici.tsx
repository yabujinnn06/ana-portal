import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { FlashlightOff, Flashlight, RefreshCcw, Maximize2, Zap, CheckCircle2, AlertTriangle, XCircle, GitMerge, X, Loader2, ArrowLeftRight, Boxes, PackagePlus, Search } from "lucide-react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType, NotFoundException, Result } from "@zxing/library";
import { cn } from "../lib/cn";
import { Ozet, StokOzet, Tarama } from "../lib/api";
import { ChatMesaji, SayimWS, SesMesaji } from "../lib/ws";
import TelsizBar from "./TelsizBar";

type AktifStok = { id: number; kod: string; ad: string };

type Props = {
  onKod: (kod: string) => void;
  sonuc?: Tarama | null;
  ozet?: Ozet | null;
  ws?: SayimWS | null;
  sonChat?: ChatMesaji | SesMesaji | null;
  oturumId?: number;
  aktifStok?: AktifStok | null;
  stoklar?: StokOzet[];
  onStokBaslat?: (kod: string, ad: string) => Promise<void>;
  onStoktanSec?: (s: StokOzet) => void;
  onBilinmeyenEkle?: (secim: { stokId?: number | null; yeniKod?: string; yeniAd?: string; yeniPortal?: number }) => Promise<void>;
};

type Kayit = {
  id: number;
  kod: string;
  ts: number;
  sonuc?: Tarama;
};

const D_RENK: Record<string, string> = {
  basarili: "border-good/40 bg-good/15 text-good-ink",
  mukerrer: "border-warn/40 bg-warn/15 text-warn-ink",
  bulunamadi: "border-bad/40 bg-bad/15 text-bad-ink",
  cakisma: "border-warn/50 bg-warn/20 text-warn-ink",
};
const D_IKON: Record<string, any> = {
  basarili: CheckCircle2, mukerrer: AlertTriangle,
  bulunamadi: XCircle, cakisma: GitMerge,
};
const D_ET: Record<string, string> = {
  basarili: "OK", mukerrer: "DUP", bulunamadi: "404", cakisma: "CONF",
};

// GoldSrc / eski Steam (CS 1.6 konsolu) paleti: oliv panel + bevel kenar + amber vurgu
const BEVEL_OUT = "border-2 border-t-[#6e7861] border-l-[#6e7861] border-b-[#22281c] border-r-[#22281c]";
const BEVEL_IN = "border-2 border-t-[#22281c] border-l-[#22281c] border-b-[#6e7861] border-r-[#6e7861]";
const D_TAM: Record<string, { label: string; renk: string }> = {
  basarili: { label: "SAYILDI", renk: "text-[#a8c060]" },
  mukerrer: { label: "MÜKERRER — ZATEN SAYILMIŞ", renk: "text-[#e8a33d]" },
  bulunamadi: { label: "LİSTEDE YOK", renk: "text-[#d9583b]" },
  cakisma: { label: "ÇAKIŞMA — STOK SEÇ", renk: "text-[#e8a33d]" },
};

const FORMATLAR = [
  BarcodeFormat.QR_CODE, BarcodeFormat.DATA_MATRIX,
  BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.CODE_93,
  BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E,
  BarcodeFormat.ITF, BarcodeFormat.CODABAR, BarcodeFormat.PDF_417, BarcodeFormat.AZTEC,
];

const NATIVE_FORMATLAR = [
  "qr_code", "code_128", "code_39", "code_93", "ean_13", "ean_8",
  "upc_a", "upc_e", "itf", "codabar", "data_matrix", "aztec", "pdf417",
];

const COOLDOWN_MS = 700;
const GENEL_KILIT_MS = 1300;
const ZORLANMA_ESIK_MS = 6000;
const TORCH_AC_MS = 1500;
const TORCH_KAPA_MS = 800;
const TORCH_DENEME_MAX = 4;
const NATIVE_TARAMA_MS = 110;
const ZXING_GECIKME_MS = 140;

function normalize(s: string): string {
  return s.toUpperCase().replace(/[\s\r\n\t]/g, "");
}

let _seq = 1;

export default function KameraTarayici({ onKod, sonuc, ozet, ws, sonChat, oturumId, aktifStok, stoklar, onStokBaslat, onStoktanSec, onBilinmeyenEkle }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sonOkumaRef = useRef<{ kod: string; t: number } | null>(null);
  const sonTetikRef = useRef<number>(0);
  const sonAktiviteRef = useRef<number>(Date.now());
  const loopTimerRef = useRef<number | null>(null);
  const torchPatternRef = useRef<number | null>(null);
  const torchDenemeRef = useRef<number>(0);

  const [cihazlar, setCihazlar] = useState<MediaDeviceInfo[]>([]);
  const [secCihaz, setSecCihaz] = useState<string | null>(null);
  const [acik] = useState(true);
  const [tam, setTam] = useState(false);
  const [torch, setTorch] = useState(false);
  const [torchVar, setTorchVar] = useState(false);
  const [otoTorch, setOtoTorch] = useState(true);
  const [hata, setHata] = useState<string | null>(null);
  const [sayac, setSayac] = useState(0);
  const [flas, setFlas] = useState(0);
  const [gecmis, setGecmis] = useState<Kayit[]>([]);
  const [hazir, setHazir] = useState(false);
  const [stokPaneli, setStokPaneli] = useState(false);
  const [yeniKod, setYeniKod] = useState("");
  const [yeniAd, setYeniAd] = useState("");
  const [gecisBusy, setGecisBusy] = useState(false);
  const yeniKodRef = useRef<HTMLInputElement>(null);
  const [bilinmeyenPaneli, setBilinmeyenPaneli] = useState(false);
  const [bMod, setBMod] = useState<"mevcut" | "yeni">("mevcut");
  const [bArama, setBArama] = useState("");
  const [bSecStokId, setBSecStokId] = useState<number | null>(null);
  const [bYKod, setBYKod] = useState("");
  const [bYAd, setBYAd] = useState("");
  const [bYPortal, setBYPortal] = useState("");
  const [bBusy, setBBusy] = useState(false);

  const torchUygula = useCallback(async (acik: boolean) => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: acik }] as any });
      setTorch(acik);
    } catch { /* ignore */ }
  }, []);

  const otoTorchDur = useCallback(async () => {
    if (torchPatternRef.current) {
      window.clearTimeout(torchPatternRef.current);
      torchPatternRef.current = null;
    }
    torchDenemeRef.current = 0;
    if (torch) await torchUygula(false);
  }, [torch, torchUygula]);

  const otoTorchDongu = useCallback(async () => {
    if (!torchVar || !otoTorch) return;
    if (torchDenemeRef.current >= TORCH_DENEME_MAX) { await otoTorchDur(); return; }
    torchDenemeRef.current += 1;
    await torchUygula(true);
    torchPatternRef.current = window.setTimeout(async () => {
      await torchUygula(false);
      torchPatternRef.current = window.setTimeout(otoTorchDongu, TORCH_KAPA_MS);
    }, TORCH_AC_MS);
  }, [torchVar, otoTorch, torchUygula, otoTorchDur]);

  const tetikle = useCallback((kod: string) => {
    if (!kod) return;
    const now = Date.now();
    if (now - sonTetikRef.current < GENEL_KILIT_MS) return;
    const son = sonOkumaRef.current;
    if (son && son.kod === kod && now - son.t < COOLDOWN_MS) return;
    sonOkumaRef.current = { kod, t: now };
    sonTetikRef.current = now;
    sonAktiviteRef.current = now;
    setSayac(s => s + 1);
    setFlas(f => f + 1);
    try { navigator.vibrate?.([35, 20, 35]); } catch {}
    setGecmis(g => [{ id: _seq++, kod, ts: now }, ...g].slice(0, 6));
    onKod(kod);
    otoTorchDur();
  }, [onKod, otoTorchDur]);

  useEffect(() => {
    if (!sonuc?.seri) return;
    const hedef = normalize(sonuc.raw_input ?? sonuc.raw_seri ?? sonuc.seri);
    setGecmis(g => {
      let bulundu = false;
      const arr = g.map(k => {
        if (bulundu) return k;
        if (k.sonuc) return k;
        if (normalize(k.kod) === hedef) {
          bulundu = true;
          return { ...k, sonuc };
        }
        return k;
      });
      return arr;
    });
  }, [sonuc]);

  useEffect(() => {
    if (!secCihaz) return;
    navigator.mediaDevices?.enumerateDevices().then(d => {
      const v = d.filter(x => x.kind === "videoinput");
      if (v.length) setCihazlar(v);
    }).catch(() => {});
  }, [secCihaz]);

  useEffect(() => {
    if (!acik) return;
    let iptal = false;
    setHata(null);
    setHazir(false);
    sonAktiviteRef.current = Date.now();

    async function nativeBaslat(stream: MediaStream) {
      const W = window as any;
      if (!("BarcodeDetector" in W)) return false;
      try {
        const desteklenen: string[] = await W.BarcodeDetector.getSupportedFormats?.() ?? NATIVE_FORMATLAR;
        const formats = NATIVE_FORMATLAR.filter(f => desteklenen.includes(f));
        if (!formats.length) return false;
        const det = new W.BarcodeDetector({ formats });
        const v = videoRef.current!;
        v.srcObject = stream;
        await v.play();
        let calisiyor = false;
        const tek = async () => {
          if (iptal || !videoRef.current) return;
          if (calisiyor || document.visibilityState !== "visible") return;
          calisiyor = true;
          try {
            const codes = await det.detect(videoRef.current);
            if (codes && codes.length) tetikle(String(codes[0].rawValue ?? ""));
          } catch { /* ignore */ }
          calisiyor = false;
        };
        loopTimerRef.current = window.setInterval(tek, NATIVE_TARAMA_MS);
        return true;
      } catch { return false; }
    }

    async function zxingBaslat(stream: MediaStream) {
      const hints = new Map<DecodeHintType, any>();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, FORMATLAR);
      hints.set(DecodeHintType.TRY_HARDER, false);
      const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: ZXING_GECIKME_MS });
      readerRef.current = reader;
      const v = videoRef.current!;
      v.srcObject = stream;
      await v.play();
      reader.decodeFromStream(stream, v, (result: Result | undefined, err: any) => {
        if (iptal) return;
        if (result) tetikle(result.getText());
        if (err && !(err instanceof NotFoundException)) { /* ignore */ }
      }).catch(() => {});
    }

    async function baslat() {
      try {
        const video: MediaTrackConstraints = secCihaz
          ? { deviceId: { exact: secCihaz } }
          : { facingMode: { ideal: "environment" } };
        Object.assign(video, {
          width: { ideal: 1280 }, height: { ideal: 720 },
          frameRate: { ideal: 24, max: 30 },
        });
        const stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
        if (iptal) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        setHazir(true);

        if (!secCihaz) {
          try {
            const allDev = await navigator.mediaDevices.enumerateDevices();
            const vs = allDev.filter(x => x.kind === "videoinput");
            if (vs.length) {
              setCihazlar(vs);
              const arka = vs.find(x => /back|rear|arka|environment/i.test(x.label)) ?? vs[vs.length - 1];
              setSecCihaz(arka.deviceId);
            }
          } catch { /* ignore */ }
        }

        const track = stream.getVideoTracks()[0];
        try {
          await track.applyConstraints({ advanced: [{ focusMode: "continuous" } as any] });
        } catch { /* ignore */ }
        const caps = track.getCapabilities ? track.getCapabilities() as any : {};
        setTorchVar(!!caps.torch);

        const nativeOK = await nativeBaslat(stream);
        if (!nativeOK) await zxingBaslat(stream);
      } catch (e: any) {
        setHata(e?.message ?? "Kamera açılamadı");
      }
    }
    baslat();

    return () => {
      iptal = true;
      if (loopTimerRef.current) window.clearInterval(loopTimerRef.current);
      loopTimerRef.current = null;
      if (torchPatternRef.current) window.clearTimeout(torchPatternRef.current);
      try { readerRef.current && (readerRef.current as any).reset?.(); } catch {}
      readerRef.current = null;
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    };
  }, [acik, secCihaz, tetikle]);

  useEffect(() => {
    if (!otoTorch || !torchVar) return;
    const t = setInterval(() => {
      if (torchPatternRef.current) return;
      const gecen = Date.now() - sonAktiviteRef.current;
      if (gecen > ZORLANMA_ESIK_MS) {
        torchDenemeRef.current = 0;
        otoTorchDongu();
      }
    }, 1500);
    return () => clearInterval(t);
  }, [otoTorch, torchVar, otoTorchDongu]);

  async function torchToggle() {
    if (!torchVar) return;
    await otoTorchDur();
    await torchUygula(!torch);
  }

  function digerKamera() {
    if (cihazlar.length < 2) return;
    const idx = cihazlar.findIndex(c => c.deviceId === secCihaz);
    const next = cihazlar[(idx + 1) % cihazlar.length];
    setSecCihaz(next.deviceId);
  }

  useEffect(() => {
    if (stokPaneli) window.setTimeout(() => yeniKodRef.current?.focus({ preventScroll: true }), 60);
  }, [stokPaneli]);

  useEffect(() => {
    setStokPaneli(false);
    setYeniKod("");
    setYeniAd("");
  }, [aktifStok?.id]);

  async function stokPanelindeBaslat(e?: FormEvent) {
    e?.preventDefault();
    const k = yeniKod.trim();
    if (!k || !onStokBaslat || gecisBusy) return;
    setGecisBusy(true);
    try {
      await onStokBaslat(k, yeniAd.trim() || k);
      setYeniKod("");
      setYeniAd("");
      setStokPaneli(false);
    } catch { /* ust bilesen toast gosterir */ } finally {
      setGecisBusy(false);
    }
  }

  function stokPanelindeSec(s: StokOzet) {
    onStoktanSec?.(s);
    setStokPaneli(false);
  }

  const digerStoklar = (stoklar ?? []).filter(s => s.id !== aktifStok?.id).slice(0, 10);

  const bFiltre = bArama.trim().toLowerCase();
  const bListe = (stoklar ?? []).filter(s =>
    !bFiltre || `${s.stok_kodu} ${s.urun_adi}`.toLowerCase().includes(bFiltre)
  ).slice(0, 30);

  function bilinmeyenPaneliniAc() {
    setBMod("mevcut");
    setBArama("");
    setBSecStokId(null);
    setBYKod("");
    setBYAd("");
    setBYPortal("");
    setBilinmeyenPaneli(true);
  }

  async function bilinmeyenGonder(e?: FormEvent) {
    e?.preventDefault();
    if (!onBilinmeyenEkle || bBusy) return;
    if (bMod === "mevcut" && !bSecStokId) return;
    setBBusy(true);
    try {
      await onBilinmeyenEkle(
        bMod === "mevcut"
          ? { stokId: bSecStokId }
          : { yeniKod: bYKod.trim(), yeniAd: bYAd.trim(), yeniPortal: Number(bYPortal) || 0 }
      );
      setBilinmeyenPaneli(false);
    } catch { /* ust bilesen toast gosterir */ } finally {
      setBBusy(false);
    }
  }

  const sonAktif = gecmis[0];

  const videoBlok = (
    <div className={cn("relative overflow-hidden bg-deeper",
      tam ? "h-full w-full" : "aspect-[4/3] sm:aspect-video rounded-xl")}>
      <video ref={videoRef} className="absolute inset-0 h-full w-full object-cover"
        playsInline muted autoPlay />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="relative w-[78%] h-[58%] max-w-[640px]">
          <Kose pos="tl" /><Kose pos="tr" /><Kose pos="bl" /><Kose pos="br" />
          <div
            className="absolute left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-accent to-transparent shadow-[0_0_20px_2px_rgba(191,111,52,0.85)]"
            style={{ animation: "km-scan 2.4s linear infinite", top: 0 }}
          />
        </div>
      </div>

      <AnimatePresence>
        {flas > 0 && (
          <motion.div
            key={flas}
            initial={{ opacity: 0.55 }} animate={{ opacity: 0 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="pointer-events-none absolute inset-0 bg-good ring-4 ring-good/80"
          />
        )}
      </AnimatePresence>

      {!hazir && !hata && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-deeper/70 text-white">
          <Loader2 size={28} className="animate-spin text-accent" />
          <div className="text-xs uppercase tracking-[0.22em] opacity-80">Kamera başlatılıyor</div>
        </div>
      )}

      {hata && (
        <div className="absolute inset-0 flex items-center justify-center text-bad-ink text-xs p-3 text-center bg-black/70 backdrop-blur">
          {hata}
        </div>
      )}
    </div>
  );

  const tamBtn = cn("h-9 w-9 sm:h-11 sm:w-11 shrink-0 flex items-center justify-center bg-[#4c5844] hover:bg-[#5a6850] active:bg-[#414d3a] text-[#d8ded3] transition-colors", BEVEL_OUT);
  const ufakBtn = "h-8 w-8 rounded-md bg-black/40 hover:bg-black/60 text-white flex items-center justify-center backdrop-blur";
  const ucBar = (
    <div className={cn("flex items-center gap-1 shrink-0",
      tam ? "" : "ml-auto"
    )}>
      {torchVar && (
        <button onClick={() => setOtoTorch(v => !v)}
          title={otoTorch ? "Oto-flaşı kapat" : "Oto-flaşı aç"}
          className={cn(
            tam ? tamBtn : ufakBtn,
            tam && otoTorch && "text-[#a8c060]",
            !tam && (otoTorch ? "!bg-good/40 hover:!bg-good/60" : "")
          )}>
          <Zap size={tam ? 16 : 14} />
        </button>
      )}
      {torchVar && (
        <button onClick={torchToggle} title="Flaş"
          className={cn(tam ? tamBtn : ufakBtn, tam && torch && "text-[#e8a33d]")}>
          {torch ? <Flashlight size={tam ? 16 : 14} /> : <FlashlightOff size={tam ? 16 : 14} />}
        </button>
      )}
      {cihazlar.length > 1 && (
        <button onClick={digerKamera} title="Diğer kamera"
          className={cn(tam ? tamBtn : ufakBtn)}>
          <RefreshCcw size={tam ? 16 : 14} />
        </button>
      )}
      <button onClick={() => setTam(t => !t)} title={tam ? "Küçült" : "Büyüt"}
        className={cn(tam ? tamBtn : ufakBtn, tam && "text-[#e8a33d]")}>
        {tam ? <X size={18} /> : <Maximize2 size={14} />}
      </button>
    </div>
  );

  if (tam) {
    const dur = sonAktif?.sonuc?.durum;
    const Ikon = dur && D_IKON[dur];
    const sayilanYuzde = ozet && ozet.toplam_seri > 0 ? Math.round(ozet.sayilan_seri / ozet.toplam_seri * 100) : 0;
    const aktifStokOzet = aktifStok ? (stoklar ?? []).find(s => s.id === aktifStok.id) ?? null : null;
    const stokKodu = sonAktif?.sonuc?.stok_kodu ?? aktifStok?.kod ?? null;
    const stokAdi = sonAktif?.sonuc?.urun_adi ?? aktifStok?.ad ?? null;
    const stokTaramaSayisi = stokKodu
      ? gecmis.filter(k => k.sonuc?.stok_kodu === stokKodu).length
      : 0;
    const stokSayilan = sonAktif?.sonuc?.sayilan ?? aktifStokOzet?.sayilan ?? null;
    const stokToplam = sonAktif?.sonuc?.toplam ?? aktifStokOzet?.toplam ?? null;
    const stokKalan = sonAktif?.sonuc?.kalan
      ?? (stokToplam != null && stokSayilan != null ? stokToplam - stokSayilan : null);
    const stokYuzde = stokToplam && stokToplam > 0 && stokSayilan != null
      ? Math.min(100, Math.round((stokSayilan / stokToplam) * 100)) : 0;
    const stokPortal = sonAktif?.sonuc?.portal_sayim ?? aktifStokOzet?.portal_sayim ?? null;
    const stokFark = sonAktif?.sonuc?.portal_fark
      ?? (stokSayilan != null && stokPortal != null ? stokSayilan - stokPortal : null);
    const bilinmeyenSayisi = gecmis.filter(k => k.sonuc?.durum === "bulunamadi").length;
    const basariliSayisi = gecmis.filter(k => k.sonuc?.durum === "basarili").length;
    const durTam = dur ? D_TAM[dur] : null;
    const gosterilenSeri = sonAktif?.sonuc?.seri ?? sonAktif?.kod ?? null;
    const tamBody = (
      <div className="fixed inset-0 z-[55] bg-[#3e4637] text-[#d8ded3] flex flex-col"
        style={{
          paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)",
          fontFamily: "Verdana, Tahoma, 'Segoe UI', sans-serif",
        }}>
        {ws && oturumId != null && (
          <TelsizBar gomulu ws={ws} son={sonChat ?? null} oturumId={oturumId} />
        )}

        {/* Baslik cubugu — eski Steam pencere basligi */}
        <div className={cn("mx-1.5 mt-1.5 pl-2 pr-1.5 py-1.5 flex items-center gap-1.5 sm:gap-2.5 bg-[#4c5844]", BEVEL_OUT)}>
          <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#e8a33d] shrink-0 hidden sm:inline">
            Sayım Tarayıcı
          </span>
          <span className="text-[10px] text-[#d8ded3]/55 font-mono shrink-0 truncate min-w-0">{sayac} okuma</span>
          {otoTorch && torchVar && (
            <span className="text-[10px] text-[#a8c060] hidden sm:inline-flex items-center gap-1 shrink-0">
              <Zap size={10} /> oto-flaş
            </span>
          )}
          <div className="ml-auto">{ucBar}</div>
        </div>

        {/* Aktif stok cubugu (serbest sayim) */}
        {aktifStok && (
          <button
            onClick={() => setStokPaneli(true)}
            className={cn("mx-1.5 mt-1.5 px-2.5 py-2 flex items-center gap-2 bg-[#333b2b] hover:bg-[#414b36] transition-colors text-left", BEVEL_IN)}
          >
            <Boxes size={15} className="text-[#e8a33d] shrink-0" />
            <span className="min-w-0 flex-1 truncate text-sm">
              <span className="font-mono font-bold text-[#e8a33d]">{aktifStok.kod}</span>
              <span className="text-[#d8ded3]/80"> — {aktifStok.ad}</span>
            </span>
            {aktifStokOzet && (
              <span className="shrink-0 font-mono leading-none text-right">
                <span className="block text-lg font-bold text-[#a8c060]">{aktifStokOzet.sayilan}</span>
                <span className="block text-[9px] uppercase tracking-wider text-[#d8ded3]/50 mt-0.5">sayıldı</span>
              </span>
            )}
            <span className={cn("shrink-0 px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider bg-[#4c5844] text-[#e8a33d] inline-flex items-center gap-1", BEVEL_OUT)}>
              Değiştir <ArrowLeftRight size={11} />
            </span>
          </button>
        )}

        {/* Kamera gorunumu — inset cerceve */}
        <div className={cn("relative mx-1.5 mt-1.5 flex-1 min-h-0 bg-black", BEVEL_IN)}>
          {videoBlok}
        </div>

        {/* Bilgi konsolu — sabit iskelet, kayma yok */}
        <div className={cn("m-1.5 bg-[#333b2b] px-2.5 py-2", BEVEL_IN)}>
          {/* 1) Durum + seri satiri */}
          <div className="flex items-center gap-2.5 min-h-[46px]">
            {sonAktif ? (
              <>
                {Ikon ? <Ikon size={24} className={cn("shrink-0", durTam?.renk ?? "text-[#d8ded3]/60")} />
                  : <Loader2 size={22} className="animate-spin text-[#d8ded3]/50 shrink-0" />}
                <div className="min-w-0 flex-1">
                  <div className={cn("text-[10px] font-bold uppercase tracking-[0.16em] leading-none",
                    durTam?.renk ?? "text-[#d8ded3]/50")}>
                    {durTam?.label ?? "İŞLENİYOR…"}
                  </div>
                  <div className="font-mono text-xl font-bold text-white leading-tight break-all mt-0.5">
                    {gosterilenSeri}
                  </div>
                </div>
                <span className="text-[10px] font-mono text-[#d8ded3]/45 shrink-0 self-start mt-1">
                  {new Date(sonAktif.ts).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </span>
              </>
            ) : (
              <div className="flex-1 text-center text-[13px] text-[#d8ded3]/60">
                Çerçeveye barkodu yerleştir — otomatik okur.
              </div>
            )}
          </div>

          {/* 2) Stok satiri — her zaman ayni yukseklik */}
          <div className="mt-1 min-h-[20px] text-[13px] truncate">
            {stokKodu ? (
              <>
                <span className="font-mono font-bold text-[#e8a33d]">[{stokKodu}]</span>
                <span className="text-[#d8ded3]/85"> {stokAdi}</span>
              </>
            ) : (
              <span className="text-[#d8ded3]/30">stok: —</span>
            )}
          </div>

          {/* 3) Sayim istatistikleri — her zaman gorunur */}
          <div className="mt-2 grid grid-cols-4 gap-1.5">
            <KStat etiket="Sayılan" deger={stokSayilan} renk="text-[#a8c060]" buyuk />
            <KStat etiket="Stokta" deger={stokToplam} renk="text-[#d8ded3]" />
            <KStat etiket="Portal" deger={stokPortal} renk="text-[#7eb8c9]" />
            <KStat etiket="Fark" deger={stokFark}
              renk={stokFark == null ? "text-[#d8ded3]/40"
                : stokFark === 0 ? "text-[#a8c060]"
                : stokFark > 0 ? "text-[#e8a33d]"
                : "text-[#d9583b]"}
              isaret />
          </div>

          {/* 4) Ilerleme — her zaman gorunur */}
          <div className={cn("mt-2 h-3 bg-[#2a3123] overflow-hidden", BEVEL_IN)}>
            <div className={cn("h-full transition-all duration-300",
              stokKalan === 0 && stokToplam ? "bg-[#a8c060]" : "bg-[#e8a33d]")}
              style={{ width: `${stokYuzde}%` }} />
          </div>
          <div className="mt-1 flex items-center justify-between text-[10px] font-mono text-[#d8ded3]/55 min-h-[15px]">
            <span>%{stokYuzde}</span>
            <span>kalan: <b className={stokKalan === 0 && stokToplam ? "text-[#a8c060]" : "text-[#e8a33d]"}>{stokKalan ?? "—"}</b></span>
            <span>bu stoğa {stokTaramaSayisi} okuma</span>
          </div>

          {/* 5) Bulunamadi aksiyonu */}
          {dur === "bulunamadi" && onBilinmeyenEkle && (
            <button onClick={bilinmeyenPaneliniAc}
              className={cn("mt-2 w-full py-2.5 bg-[#8a3a26] hover:bg-[#a04530] text-white text-sm font-bold flex items-center justify-center gap-2 transition-colors", BEVEL_OUT)}>
              <PackagePlus size={15} /> Bilinmeyen Seriyi Ekle ({bilinmeyenSayisi} bilinmeyen)
            </button>
          )}

          {/* 6) Oturum ozeti */}
          <div className="mt-2 flex items-center justify-center gap-3 text-[11px] font-mono text-[#d8ded3]/55 min-h-[15px]">
            <span><b className="text-[#a8c060]">{basariliSayisi}</b> sayıldı</span>
            <span className="opacity-40">|</span>
            <span><b className="text-[#d9583b]">{bilinmeyenSayisi}</b> bilinmeyen</span>
            <span className="opacity-40">|</span>
            <span><b className="text-[#d8ded3]">{sayac}</b> toplam okuma</span>
            {ozet && (
              <>
                <span className="opacity-40">|</span>
                <span>oturum: <b className="text-[#a8c060]">{ozet.sayilan_seri}</b>/{ozet.toplam_seri} (%{sayilanYuzde})</span>
              </>
            )}
          </div>

          {/* 7) Onceki okumalar — sabit satir */}
          <div className="mt-1.5 flex gap-1.5 overflow-x-auto min-h-[26px]">
            {gecmis.slice(1, 6).map(k => {
              const d = k.sonuc?.durum;
              return (
                <div key={k.id} className={cn(
                  "shrink-0 px-2 py-1 text-[10px] font-mono inline-flex items-center gap-1 bg-[#2a3123]", BEVEL_IN,
                  d === "basarili" && "text-[#a8c060]",
                  d === "mukerrer" && "text-[#e8a33d]",
                  d === "bulunamadi" && "text-[#d9583b]",
                  d === "cakisma" && "text-[#e8a33d]",
                  !d && "text-[#d8ded3]/50"
                )}>
                  <span className="truncate max-w-[110px]">{k.kod}</span>
                </div>
              );
            })}
          </div>
        </div>

        <AnimatePresence>
          {stokPaneli && (
            <>
              <motion.div
                key="stok-backdrop"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="absolute inset-0 z-[70] bg-black/60 backdrop-blur-sm"
                onClick={() => setStokPaneli(false)}
              />
              <motion.div
                key="stok-panel"
                initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
                transition={{ type: "spring", damping: 32, stiffness: 320 }}
                className="absolute left-0 right-0 bottom-0 z-[71] max-h-[78%] overflow-y-auto bg-[#3e4637] text-[#d8ded3] border-2 border-t-[#6e7861] border-l-[#6e7861] border-b-[#22281c] border-r-[#22281c] shadow-2xl"
                style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
              >
                <div className="sticky top-0 flex items-center justify-between px-4 py-3 bg-[#4c5844] border-b-2 border-[#22281c]">
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    <ArrowLeftRight size={16} className="text-[#e8a33d]" /> Stok Değiştir
                  </span>
                  <button onClick={() => setStokPaneli(false)}
                    className="p-1.5 rounded-md hover:bg-[#5a6850] text-[#d8ded3]/70">
                    <X size={18} />
                  </button>
                </div>

                <div className="p-4 space-y-4">
                  {aktifStok && (
                    <div className="text-xs text-[#d8ded3]/60">
                      Şu an sayıyorsun: <span className="font-mono font-bold text-[#e8a33d]">{aktifStok.kod}</span> — {aktifStok.ad}
                    </div>
                  )}

                  {digerStoklar.length > 0 && (
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#e8a33d]/85 mb-1.5">Bugün sayılan stoklar</div>
                      <div className="flex flex-wrap gap-1.5">
                        {digerStoklar.map(s => (
                          <button key={s.id} onClick={() => stokPanelindeSec(s)}
                            className="text-xs font-mono bg-[#4c5844] hover:bg-[#5a6850] active:bg-[#414d3a] px-2.5 py-1.5 border-2 border-t-[#6e7861] border-l-[#6e7861] border-b-[#22281c] border-r-[#22281c] transition-colors">
                            {s.stok_kodu} <span className="text-[#d8ded3]/50">({s.sayilan})</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {(onStokBaslat) && (
                    <form onSubmit={stokPanelindeBaslat} className="space-y-2">
                      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#e8a33d]/85">Yeni / farklı stok</div>
                      <input
                        ref={yeniKodRef}
                        value={yeniKod}
                        onChange={e => setYeniKod(e.target.value)}
                        placeholder="Stok kodu"
                        autoComplete="off" spellCheck={false}
                        className="w-full px-3 py-3 rounded-lg bg-[#2a3123] border-2 border-t-[#22281c] border-l-[#22281c] border-b-[#6e7861] border-r-[#6e7861] focus:border-[#e8a33d] text-base font-mono outline-none transition-colors placeholder:text-[#d8ded3]/30"
                      />
                      <input
                        value={yeniAd}
                        onChange={e => setYeniAd(e.target.value)}
                        placeholder="Ürün adı (yeniyse)"
                        autoComplete="off"
                        className="w-full px-3 py-3 rounded-lg bg-[#2a3123] border-2 border-t-[#22281c] border-l-[#22281c] border-b-[#6e7861] border-r-[#6e7861] focus:border-[#e8a33d] text-sm outline-none transition-colors placeholder:text-[#d8ded3]/30"
                      />
                      <button type="submit" disabled={!yeniKod.trim() || gecisBusy}
                        className="w-full py-3 rounded-lg bg-[#5a7a2e] hover:bg-[#688c36] text-white border-2 border-t-[#8aae55] border-l-[#8aae55] border-b-[#2e401a] border-r-[#2e401a] font-semibold text-sm tracking-wide disabled:opacity-40 transition-opacity">
                        {gecisBusy ? "Geçiliyor…" : "Bu Stoğa Başla"}
                      </button>
                    </form>
                  )}
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {bilinmeyenPaneli && (
            <>
              <motion.div
                key="bilinmeyen-backdrop"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="absolute inset-0 z-[70] bg-black/60 backdrop-blur-sm"
                onClick={() => setBilinmeyenPaneli(false)}
              />
              <motion.div
                key="bilinmeyen-panel"
                initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
                transition={{ type: "spring", damping: 32, stiffness: 320 }}
                className="absolute left-0 right-0 bottom-0 z-[71] max-h-[85%] overflow-y-auto bg-[#3e4637] text-[#d8ded3] border-2 border-t-[#6e7861] border-l-[#6e7861] border-b-[#22281c] border-r-[#22281c] shadow-2xl"
                style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
              >
                <div className="sticky top-0 flex items-center justify-between px-4 py-3 bg-[#4c5844] border-b-2 border-[#22281c]">
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    <PackagePlus size={16} className="text-[#d9583b]" /> Bilinmeyen Seri Ekle
                  </span>
                  <button onClick={() => setBilinmeyenPaneli(false)}
                    className="p-1.5 rounded-md hover:bg-[#5a6850] text-[#d8ded3]/70">
                    <X size={18} />
                  </button>
                </div>

                <div className="p-4 space-y-3">
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-[#2a3123] p-2 border-2 border-t-[#22281c] border-l-[#22281c] border-b-[#6e7861] border-r-[#6e7861]">
                      <div className="text-[#e8a33d]/75 uppercase tracking-wider">Okutulan</div>
                      <div className="font-mono font-bold break-all mt-1">
                        {sonAktif?.sonuc?.raw_input ?? sonAktif?.kod ?? ""}
                      </div>
                    </div>
                    <div className="bg-[#2a3123] p-2 border-2 border-t-[#22281c] border-l-[#22281c] border-b-[#6e7861] border-r-[#6e7861]">
                      <div className="text-[#e8a33d]/75 uppercase tracking-wider">Eklenecek seri</div>
                      <div className="font-mono font-bold break-all mt-1">
                        {sonAktif?.sonuc?.resolved_serial ?? sonAktif?.sonuc?.seri ?? sonAktif?.kod ?? ""}
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-1 text-xs">
                    <button onClick={() => setBMod("mevcut")} className={cn(
                      "px-3 py-1.5 rounded-md transition-colors", bMod === "mevcut" ? "bg-[#5a7a2e] hover:bg-[#688c36] text-white border-2 border-t-[#8aae55] border-l-[#8aae55] border-b-[#2e401a] border-r-[#2e401a]" : "bg-[#4c5844] hover:bg-[#5a6850] text-[#d8ded3]")}>
                      Mevcut stoğa ekle
                    </button>
                    <button onClick={() => setBMod("yeni")} className={cn(
                      "px-3 py-1.5 rounded-md transition-colors", bMod === "yeni" ? "bg-[#5a7a2e] hover:bg-[#688c36] text-white border-2 border-t-[#8aae55] border-l-[#8aae55] border-b-[#2e401a] border-r-[#2e401a]" : "bg-[#4c5844] hover:bg-[#5a6850] text-[#d8ded3]")}>
                      Yeni stok yarat
                    </button>
                  </div>

                  {bMod === "mevcut" ? (
                    <div className="space-y-2">
                      <div className="relative">
                        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#d8ded3]/45" />
                        <input value={bArama} onChange={e => setBArama(e.target.value)}
                          placeholder="Stok kodu veya ürün adı..."
                          autoComplete="off" spellCheck={false}
                          className="w-full pl-8 pr-3 py-2.5 rounded-lg bg-[#2a3123] border-2 border-t-[#22281c] border-l-[#22281c] border-b-[#6e7861] border-r-[#6e7861] focus:border-[#e8a33d] text-sm outline-none transition-colors placeholder:text-[#d8ded3]/30" />
                      </div>
                      <div className="max-h-48 overflow-auto rounded-lg border-2 border-t-[#22281c] border-l-[#22281c] border-b-[#6e7861] border-r-[#6e7861] divide-y divide-[#22281c]">
                        {bListe.length === 0 && <div className="p-3 text-sm text-[#d8ded3]/60">Sonuç yok.</div>}
                        {bListe.map(s => (
                          <button key={s.id} onClick={() => setBSecStokId(s.id)} className={cn(
                            "w-full text-left p-2.5 hover:bg-[#4c5844] text-sm transition-colors",
                            bSecStokId === s.id && "bg-[#5a7a2e]/50"
                          )}>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs bg-[#4c5844] px-1.5 py-0.5">{s.stok_kodu}</span>
                              <span className="truncate">{s.urun_adi}</span>
                              <span className="ml-auto text-xs text-[#d8ded3]/50 font-mono">{s.sayilan}/{s.toplam}</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <input value={bYKod} onChange={e => setBYKod(e.target.value)} placeholder="Stok kodu (boş=seri no)"
                        autoComplete="off" spellCheck={false}
                        className="w-full px-3 py-2.5 rounded-lg bg-[#2a3123] border-2 border-t-[#22281c] border-l-[#22281c] border-b-[#6e7861] border-r-[#6e7861] focus:border-[#e8a33d] text-sm font-mono outline-none transition-colors placeholder:text-[#d8ded3]/30" />
                      <input value={bYAd} onChange={e => setBYAd(e.target.value)} placeholder="Ürün adı"
                        autoComplete="off"
                        className="w-full px-3 py-2.5 rounded-lg bg-[#2a3123] border-2 border-t-[#22281c] border-l-[#22281c] border-b-[#6e7861] border-r-[#6e7861] focus:border-[#e8a33d] text-sm outline-none transition-colors placeholder:text-[#d8ded3]/30" />
                      <input value={bYPortal} onChange={e => setBYPortal(e.target.value)} placeholder="Portal beklenen (opt)"
                        type="number"
                        className="w-full px-3 py-2.5 rounded-lg bg-[#2a3123] border-2 border-t-[#22281c] border-l-[#22281c] border-b-[#6e7861] border-r-[#6e7861] focus:border-[#e8a33d] text-sm outline-none transition-colors placeholder:text-[#d8ded3]/30" />
                    </div>
                  )}

                  <button onClick={() => bilinmeyenGonder()}
                    disabled={bBusy || (bMod === "mevcut" && !bSecStokId)}
                    className="w-full py-3 rounded-lg bg-[#5a7a2e] hover:bg-[#688c36] text-white border-2 border-t-[#8aae55] border-l-[#8aae55] border-b-[#2e401a] border-r-[#2e401a] font-semibold text-sm tracking-wide disabled:opacity-40 transition-opacity flex items-center justify-center gap-2">
                    <PackagePlus size={16} /> {bBusy ? "Ekleniyor…" : "Ekle ve Say"}
                  </button>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    );
    return typeof document !== "undefined" ? createPortal(tamBody, document.body) : tamBody;
  }

  const sonDurum = sonAktif?.sonuc?.durum;
  const SonIkon = sonDurum && D_IKON[sonDurum];

  return (
    <div className="space-y-2">
      <div
        className="relative cursor-pointer group"
        onClick={() => setTam(true)}
        title="Dokun: tam ekran tarama"
      >
        {videoBlok}
        <div
          className="absolute top-2 left-2 right-2 flex items-center gap-2 flex-wrap"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.18em] text-white/90 px-2 py-0.5 rounded bg-black/40 backdrop-blur">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-good animate-pulse" /> tarama
          </span>
          {sayac > 0 && (
            <span className="text-[10px] font-mono text-white/80 px-2 py-0.5 rounded bg-black/40 backdrop-blur">
              {sayac} okuma
            </span>
          )}
          {ucBar}
        </div>

        {/* Video ustunde son okuma sonucu — kullanici listede degil videoda bakar */}
        <div className="absolute bottom-2 left-2 right-2 pointer-events-none">
          {sonAktif ? (
            <div className={cn(
              "rounded-lg border-2 px-3 py-2 backdrop-blur-sm flex items-center gap-2",
              sonDurum === "basarili" && "bg-good/30 border-good/70",
              sonDurum === "mukerrer" && "bg-warn/30 border-warn/70",
              sonDurum === "bulunamadi" && "bg-bad/35 border-bad/70",
              sonDurum === "cakisma" && "bg-warn/35 border-warn/80",
              !sonDurum && "bg-black/45 border-white/25",
            )}>
              {SonIkon ? <SonIkon size={18} className="text-white shrink-0" />
                : <Loader2 size={16} className="animate-spin text-white/70 shrink-0" />}
              <span className="font-mono text-sm font-bold text-white break-all flex-1 min-w-0 leading-tight">
                {sonAktif.kod}
              </span>
              {sonAktif.sonuc?.sayilan != null && (
                <span className="font-mono text-xs text-white/85 shrink-0">
                  {sonAktif.sonuc.sayilan}/{sonAktif.sonuc.toplam}
                </span>
              )}
            </div>
          ) : (
            <div className="text-center text-[11px] text-white/80 font-mono py-1 rounded bg-black/35 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity">
              dokun → tam ekran tarama
            </div>
          )}
        </div>
      </div>
      {gecmis.length > 0 && (
        <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1">
          <AnimatePresence initial={false}>
            {gecmis.map((k, idx) => {
              const dur = k.sonuc?.durum;
              const Ikon = dur && D_IKON[dur];
              const aktif = idx === 0;
              return (
                <motion.div
                  key={k.id}
                  initial={{ opacity: 0, y: -6, scale: 0.98 }}
                  animate={{ opacity: aktif ? 1 : 0.65, y: 0, scale: 1 }}
                  exit={{ opacity: 0, x: -8 }}
                  transition={{ duration: 0.18 }}
                  className={cn(
                    "card border px-3 py-2 flex items-start gap-2 text-sm",
                    dur ? D_RENK[dur] : "border-edge/60 bg-card text-ink/80",
                    aktif && "ring-2 ring-accent/30"
                  )}
                >
                  <div className="text-[10px] font-mono text-ink/50 w-12 shrink-0 mt-0.5">
                    {new Date(k.ts).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                  </div>
                  <div className="flex items-center gap-1.5 w-14 shrink-0 mt-0.5">
                    {Ikon ? <Ikon size={14} /> : (
                      <span className="inline-block h-3 w-3 rounded-full border-2 border-current border-t-transparent animate-spin opacity-60" />
                    )}
                    <span className="text-[10px] font-bold tracking-wider">
                      {dur ? D_ET[dur] : "..."}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-sm font-semibold text-ink break-all">{k.kod}</div>
                    {k.sonuc?.stok_kodu && (
                      <div className="text-xs text-ink/70 mt-0.5">
                        <span className="font-mono font-bold">{k.sonuc.stok_kodu}</span>{" · "}
                        <span className="text-ink/65">{k.sonuc.urun_adi}</span>
                      </div>
                    )}
                    {k.sonuc && (k.sonuc.toplam != null) && (
                      <div className="text-[11px] text-ink/65 mt-0.5 font-mono">
                        sayım {k.sonuc.sayilan}/{k.sonuc.toplam}
                        {k.sonuc.portal_sayim != null && <> · portal {k.sonuc.portal_sayim}</>}
                      </div>
                    )}
                    {k.sonuc?.mesaj && !k.sonuc?.stok_kodu && (
                      <div className="text-[11px] text-ink/60 mt-0.5">{k.sonuc.mesaj}</div>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

function KStat({ etiket, deger, renk, isaret, buyuk }: { etiket: string; deger: number | null; renk: string; isaret?: boolean; buyuk?: boolean }) {
  return (
    <div className={cn("bg-[#2a3123] px-1.5 py-1 text-center", BEVEL_IN)}>
      <div className="text-[8.5px] uppercase tracking-[0.14em] text-[#d8ded3]/50 leading-none">{etiket}</div>
      <div className={cn("font-mono font-bold leading-none tabular-nums mt-1", renk,
        buyuk ? "text-2xl" : "text-lg")}>
        {deger == null ? "—" : `${isaret && deger > 0 ? "+" : ""}${deger}`}
      </div>
    </div>
  );
}

function Kose({ pos }: { pos: "tl" | "tr" | "bl" | "br" }) {
  const p: Record<typeof pos, string> = {
    tl: "top-0 left-0 border-t-4 border-l-4 rounded-tl-xl",
    tr: "top-0 right-0 border-t-4 border-r-4 rounded-tr-xl",
    bl: "bottom-0 left-0 border-b-4 border-l-4 rounded-bl-xl",
    br: "bottom-0 right-0 border-b-4 border-r-4 rounded-br-xl",
  };
  return <div className={cn("absolute w-8 h-8 border-accent", p[pos])} />;
}
