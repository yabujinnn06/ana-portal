import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeftRight, Camera, Check, ChevronRight, ClipboardCheck, History,
  Loader2, PackageCheck, PackageMinus, Search, Trash2, UserRound, Users, X, Zap,
} from "lucide-react";
import BarkodInput from "../components/BarkodInput";
import KameraTarayici from "../components/KameraTarayici";
import { Button } from "../components/ui/Button";
import {
  api, Tarama, ZimmetCalisan, ZimmetCalisanDetay, ZimmetUrun,
} from "../lib/api";
import { useAuth } from "../lib/auth";
import { cn } from "../lib/cn";
import { sound } from "../lib/sound";
import { useToast } from "../lib/toast";

type Mod = "ver" | "kontrol";

function tarihSaat(value: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(new Date(value));
}

export default function Zimmet() {
  const toast = useToast();
  const { user } = useAuth();
  const [mod, setMod] = useState<Mod>("ver");
  const [arama, setArama] = useState("");
  const [calisanlar, setCalisanlar] = useState<ZimmetCalisan[]>([]);
  const [calisan, setCalisan] = useState<ZimmetCalisan | null>(null);
  const [detay, setDetay] = useState<ZimmetCalisanDetay | null>(null);
  const [listeBusy, setListeBusy] = useState(true);
  const [detayBusy, setDetayBusy] = useState(false);
  const [taramaBusy, setTaramaBusy] = useState(false);
  const [islemBusy, setIslemBusy] = useState(false);
  const [sepet, setSepet] = useState<ZimmetUrun[]>([]);
  const [eslesmeler, setEslesmeler] = useState<ZimmetUrun[]>([]);
  const [notu, setNotu] = useState("");
  const [devirOnayi, setDevirOnayi] = useState(false);
  const [kamera, setKamera] = useState(false);
  const [iadeSecim, setIadeSecim] = useState<Set<number>>(new Set());
  const [ozet, setOzet] = useState({ zimmetli_urun: 0, zimmetli_calisan: 0, bugun_hareket: 0 });
  const [hizliAcik, setHizliAcik] = useState(false);
  const [hizliStokKodu, setHizliStokKodu] = useState("");
  const [hizliUrunAdi, setHizliUrunAdi] = useState("");
  const [hizliSeriNo, setHizliSeriNo] = useState("");
  const [hizliBusy, setHizliBusy] = useState(false);
  const [hizliKamera, setHizliKamera] = useState(false);
  const [zimmetSonuc, setZimmetSonuc] = useState<Tarama | null>(null);
  const [hizliSonuc, setHizliSonuc] = useState<Tarama | null>(null);

  const ozetYenile = useCallback(() => {
    api.zimmetOzet().then(setOzet).catch(() => {});
  }, []);

  useEffect(() => { ozetYenile(); }, [ozetYenile]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setListeBusy(true);
      api.zimmetCalisanlar(arama)
        .then(setCalisanlar)
        .catch(e => toast.push("err", e.message))
        .finally(() => setListeBusy(false));
    }, 180);
    return () => window.clearTimeout(timer);
  }, [arama, toast]);

  const detayYenile = useCallback(async (id: number) => {
    setDetayBusy(true);
    try { setDetay(await api.zimmetCalisanDetay(id)); }
    catch (e: any) { toast.push("err", e.message); }
    finally { setDetayBusy(false); }
  }, [toast]);

  useEffect(() => {
    setSepet([]);
    setEslesmeler([]);
    setIadeSecim(new Set());
    setDevirOnayi(false);
    setZimmetSonuc(null);
    setHizliSonuc(null);
    if (calisan) void detayYenile(calisan.id);
    else setDetay(null);
  }, [calisan, detayYenile]);

  const sepeteEkle = useCallback((urun: ZimmetUrun) => {
    if (!calisan) return;
    if (urun.zimmet_employee_id === calisan.id) {
      sound.uyari();
      toast.push("warn", `${urun.seri_no} zaten ${calisan.ad} üzerinde.`);
      return;
    }
    setSepet(current => {
      if (current.some(x => x.seri_id === urun.seri_id)) {
        sound.uyari();
        toast.push("warn", `${urun.seri_no} teslim listesinde zaten var.`);
        return current;
      }
      sound.basarili();
      return [urun, ...current];
    });
    setEslesmeler([]);
  }, [calisan, toast]);

  const barkodKontrol = useCallback(async (barkod: string) => {
    if (!calisan || taramaBusy) return;
    setTaramaBusy(true);
    setEslesmeler([]);
    try {
      const result = await api.zimmetBarkodKontrol(barkod);
      if (!result.sonuclar.length) {
        sound.hata();
        toast.push("err", `Kayıtlı ürün bulunamadı: ${barkod}`);
        setZimmetSonuc({ durum: "bulunamadi", mesaj: "Kayıtlı ürün bulunamadı", seri: barkod, raw_seri: barkod, raw_input: barkod });
      } else if (result.sonuclar.length === 1) {
        const urun = result.sonuclar[0];
        sepeteEkle(urun);
        setZimmetSonuc({
          durum: "basarili", mesaj: "Teslim listesine eklendi", seri: urun.seri_no,
          stok_kodu: urun.stok_kodu, urun_adi: urun.urun_adi, raw_seri: barkod, raw_input: barkod,
        });
      } else {
        sound.uyari();
        setEslesmeler(result.sonuclar);
        toast.push("warn", "Seri birden fazla depoda bulundu. Ürünü seçin.");
        setZimmetSonuc({ durum: "cakisma", mesaj: "Birden fazla eşleşme", seri: barkod, raw_seri: barkod, raw_input: barkod });
      }
    } catch (e: any) {
      sound.hata();
      toast.push("err", e.message);
      setZimmetSonuc({ durum: "bulunamadi", mesaj: e.message, seri: barkod, raw_seri: barkod, raw_input: barkod });
    } finally { setTaramaBusy(false); }
  }, [calisan, sepeteEkle, taramaBusy, toast]);

  const devirVar = useMemo(
    () => sepet.some(x => x.zimmet_employee_id && x.zimmet_employee_id !== calisan?.id),
    [sepet, calisan],
  );

  async function zimmetle() {
    if (!calisan || !sepet.length) return;
    if (devirVar && !devirOnayi) {
      toast.push("warn", "Başka çalışandaki ürünler için devir onayını işaretleyin.");
      return;
    }
    setIslemBusy(true);
    try {
      const result = await api.zimmetAta(calisan.id, sepet.map(x => x.seri_id), notu || undefined, devirOnayi);
      sound.basarili();
      toast.push("ok", `${result.calisan}: ${result.atanan} ürün zimmetlendi${result.devir ? `, ${result.devir} devir` : ""}.`);
      setSepet([]);
      setNotu("");
      setDevirOnayi(false);
      await detayYenile(calisan.id);
      setCalisanlar(rows => rows.map(x => x.id === calisan.id ? { ...x, zimmet_sayisi: (detay?.zimmetler.length ?? x.zimmet_sayisi) + result.atanan } : x));
      ozetYenile();
    } catch (e: any) { toast.push("err", e.message); }
    finally { setIslemBusy(false); }
  }

  const hizliTarama = useCallback((kod: string) => {
    const raw = kod.trim();
    if (!raw) return;
    const m = raw.match(/^\s*([0-9]{2,20})\s*([xX×/\-*])\s*(.+?)\s*$/);
    let seri: string;
    let stokKodu: string | undefined;
    if (m) {
      stokKodu = m[1].toUpperCase();
      seri = m[3].trim().toUpperCase();
      setHizliStokKodu(stokKodu);
      setHizliSeriNo(seri);
    } else {
      seri = raw.toUpperCase();
      setHizliSeriNo(seri);
    }
    sound.basarili();
    setHizliSonuc({
      durum: "basarili", mesaj: stokKodu ? "Stok kodu + seri okundu" : "Seri okundu, stok kodunu gir",
      seri, stok_kodu: stokKodu ?? null, raw_seri: raw, raw_input: raw,
    });
    if (!stokKodu) {
      toast.push("ok", `Seri okundu: ${seri}. Stok kodunu girip zimmetle.`);
    }
  }, [toast]);

  async function hizliZimmetle() {
    if (!calisan || !hizliStokKodu.trim()) return;
    setHizliBusy(true);
    try {
      const r = await api.zimmetHizli(
        calisan.id, hizliStokKodu.trim(),
        hizliUrunAdi.trim() || undefined, hizliSeriNo.trim() || undefined, notu || undefined,
      );
      sound.basarili();
      toast.push("ok", `${r.calisan}: ${r.urun_adi} (${r.seri_no}) hızlı zimmetlendi.`);
      setHizliStokKodu(""); setHizliUrunAdi(""); setHizliSeriNo("");
      await detayYenile(calisan.id);
      ozetYenile();
    } catch (e: any) { toast.push("err", e.message); }
    finally { setHizliBusy(false); }
  }

  function iadeToggle(id: number) {
    setIadeSecim(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function iadeAl() {
    if (!calisan || !iadeSecim.size) return;
    setIslemBusy(true);
    try {
      const result = await api.zimmetIade([...iadeSecim], notu || undefined);
      sound.ui();
      toast.push("ok", `${result.iade} ürün iade alındı.`);
      setIadeSecim(new Set());
      setNotu("");
      await detayYenile(calisan.id);
      setCalisanlar(rows => rows.map(x => x.id === calisan.id ? { ...x, zimmet_sayisi: Math.max(0, x.zimmet_sayisi - result.iade) } : x));
      ozetYenile();
    } catch (e: any) { toast.push("err", e.message); }
    finally { setIslemBusy(false); }
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-label text-ink/55">Depo Operasyonu</div>
          <h1 className="text-2xl sm:text-3xl">Zimmet</h1>
        </div>
        <div className="grid grid-cols-3 border border-edge bg-field rounded-md overflow-hidden min-w-[290px]">
          <OzetDeger icon={<PackageCheck size={15} />} deger={ozet.zimmetli_urun} etiket="Ürün" />
          <OzetDeger icon={<Users size={15} />} deger={ozet.zimmetli_calisan} etiket="Çalışan" />
          <OzetDeger icon={<History size={15} />} deger={ozet.bugun_hareket} etiket="Bugün" />
        </div>
      </header>

      <div className="grid lg:grid-cols-[300px_minmax(0,1fr)] gap-4 items-start">
        <aside className="card overflow-hidden lg:sticky lg:top-[72px]">
          <div className="p-3 border-b border-edge">
            <label className="relative block">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/45" />
              <input value={arama} onChange={e => setArama(e.target.value)} placeholder="Çalışan ara"
                className="w-full h-10 pl-9 pr-3 rounded-md border border-edge bg-field outline-none focus:border-accent" />
            </label>
          </div>
          <div className="max-h-[62vh] overflow-y-auto divide-y divide-edge/70">
            {listeBusy && <div className="p-6 flex justify-center"><Loader2 className="animate-spin text-accent" /></div>}
            {!listeBusy && !calisanlar.length && <div className="p-6 text-sm text-center text-ink/55">Çalışan bulunamadı</div>}
            {!listeBusy && calisanlar.map(row => (
              <button key={row.id} onClick={() => setCalisan(row)}
                className={cn("w-full px-3 py-3 flex items-center gap-3 text-left hover:bg-edge/25 transition",
                  calisan?.id === row.id && "bg-accent/15 border-l-2 border-accent")}> 
                <span className="h-9 w-9 shrink-0 rounded-full bg-deep/50 flex items-center justify-center"><UserRound size={17} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold truncate">{row.ad}</span>
                  <span className="block text-[11px] text-ink/50 truncate">{row.departman || "Departman yok"}</span>
                </span>
                <span className="font-mono text-xs text-accent">{row.zimmet_sayisi}</span>
                <ChevronRight size={14} className="text-ink/30" />
              </button>
            ))}
          </div>
        </aside>

        <section className="min-w-0 space-y-4">
          {!calisan ? (
            <div className="border border-dashed border-edge min-h-[320px] flex flex-col items-center justify-center text-center p-8">
              <UserRound size={34} className="text-ink/30 mb-3" />
              <div className="font-semibold">Çalışan seçin</div>
              <div className="text-sm text-ink/50 mt-1">Sol listeden teslim alan çalışanı açın.</div>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-3 items-center justify-between border-b border-edge pb-3">
                <div className="min-w-0">
                  <h2 className="text-xl truncate">{calisan.ad}</h2>
                  <div className="text-xs text-ink/55">{calisan.departman || "Departman yok"} · {detay?.zimmetler.length ?? calisan.zimmet_sayisi} ürün</div>
                </div>
                <div className="inline-flex p-1 bg-field border border-edge rounded-md">
                  <ModButton aktif={mod === "ver"} onClick={() => setMod("ver")} icon={<ClipboardCheck size={15} />} label="Zimmet ver" />
                  <ModButton aktif={mod === "kontrol"} onClick={() => setMod("kontrol")} icon={<PackageMinus size={15} />} label="Kontrol / iade" />
                </div>
              </div>

              {mod === "ver" ? (
                <div className="space-y-4">
                  <div className="flex gap-2 items-start">
                    <div className="flex-1 min-w-0">
                      <BarkodInput onSubmit={barkodKontrol} busy={taramaBusy} pauseFocus={kamera || hizliAcik} />
                    </div>
                    <Button variant={kamera ? "accent" : "secondary"}
                      onClick={() => { setKamera(v => !v); setHizliKamera(false); }}
                      className="h-[62px] w-[62px] px-0 shrink-0" title={kamera ? "Kamerayı kapat" : "Kamerayla okut"}>
                      {kamera ? <X size={20} /> : <Camera size={20} />}
                    </Button>
                  </div>
                  {kamera && <div className="border border-edge"><KameraTarayici onKod={barkodKontrol} sonuc={zimmetSonuc} /></div>}

                  {user?.rol === "admin" && (
                    <div className="border border-accent/40 bg-accent/5">
                      <button type="button" onClick={() => setHizliAcik(v => !v)}
                        className="w-full h-11 px-3 flex items-center gap-2 text-sm font-semibold text-accent">
                        <Zap size={15} /> Hızlı Zimmet
                        <span className="ml-auto text-[11px] font-normal text-ink/50">Sayım/depo gerekmez</span>
                      </button>
                      {hizliAcik && (
                        <div className="p-3 pt-0 space-y-2">
                          <div className="flex gap-2 items-start">
                            <div className="flex-1 min-w-0">
                              <BarkodInput onSubmit={hizliTarama} pauseFocus={kamera} />
                            </div>
                            <Button variant={hizliKamera ? "accent" : "secondary"}
                              onClick={() => { setHizliKamera(v => !v); setKamera(false); }}
                              className="h-[62px] w-[62px] px-0 shrink-0" title={hizliKamera ? "Kamerayı kapat" : "Kamerayla okut"}>
                              {hizliKamera ? <X size={20} /> : <Camera size={20} />}
                            </Button>
                          </div>
                          {hizliKamera && <div className="border border-edge"><KameraTarayici onKod={hizliTarama} sonuc={hizliSonuc} /></div>}
                          <div className="grid sm:grid-cols-2 gap-2">
                            <input value={hizliStokKodu} onChange={e => setHizliStokKodu(e.target.value)}
                              placeholder="Stok kodu *" className="h-10 px-3 border border-edge bg-field outline-none focus:border-accent" />
                            <input value={hizliUrunAdi} onChange={e => setHizliUrunAdi(e.target.value)}
                              placeholder="Ürün adı (isteğe bağlı)" className="h-10 px-3 border border-edge bg-field outline-none focus:border-accent" />
                          </div>
                          <input value={hizliSeriNo} onChange={e => setHizliSeriNo(e.target.value)}
                            placeholder="Seri no (boş bırakılırsa otomatik üretilir)"
                            className="w-full h-10 px-3 border border-edge bg-field outline-none focus:border-accent" />
                          <Button variant="accent" onClick={hizliZimmetle} disabled={hizliBusy || !hizliStokKodu.trim()} className="w-full sm:w-auto">
                            {hizliBusy ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
                            Hızlı zimmetle
                          </Button>
                        </div>
                      )}
                    </div>
                  )}

                  {!!eslesmeler.length && (
                    <div className="border border-warn/50 bg-warn/10 p-3 space-y-2">
                      <div className="text-sm font-semibold">Eşleşen ürünü seçin</div>
                      {eslesmeler.map(x => (
                        <button key={x.seri_id} onClick={() => sepeteEkle(x)}
                          className="w-full flex items-center gap-3 p-3 bg-field border border-edge hover:border-accent text-left">
                          <UrunBilgi urun={x} />
                          <ChevronRight size={16} className="ml-auto" />
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="border border-edge bg-card">
                    <div className="h-11 px-3 flex items-center justify-between border-b border-edge bg-field/50">
                      <span className="text-sm font-semibold">Teslim listesi</span>
                      <span className="font-mono text-sm text-accent">{sepet.length}</span>
                    </div>
                    {!sepet.length && <div className="p-8 text-center text-sm text-ink/45">Henüz ürün okutulmadı</div>}
                    <div className="divide-y divide-edge/70">
                      {sepet.map(x => (
                        <div key={x.seri_id} className="p-3 flex gap-3 items-center">
                          <UrunBilgi urun={x} />
                          {x.zimmet_employee_ad && x.zimmet_employee_id !== calisan.id && (
                            <span className="hidden sm:inline-flex text-[11px] px-2 py-1 border border-warn/50 text-warn-ink bg-warn/10">
                              {x.zimmet_employee_ad} üzerinden devir
                            </span>
                          )}
                          <button onClick={() => setSepet(rows => rows.filter(r => r.seri_id !== x.seri_id))}
                            title="Listeden çıkar" className="ml-auto p-2 text-ink/45 hover:text-bad-ink"><Trash2 size={16} /></button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {!!sepet.length && (
                    <div className="border-t border-edge pt-4 space-y-3">
                      <textarea value={notu} onChange={e => setNotu(e.target.value)} rows={2} maxLength={1000}
                        placeholder="Teslim notu (isteğe bağlı)" className="w-full p-3 border border-edge bg-field outline-none focus:border-accent resize-y" />
                      {devirVar && (
                        <label className="flex items-start gap-3 p-3 border border-warn/50 bg-warn/10 cursor-pointer">
                          <input type="checkbox" checked={devirOnayi} onChange={e => setDevirOnayi(e.target.checked)} className="mt-1" />
                          <span className="text-sm"><b>Devir onayı:</b> Listedeki başka çalışana zimmetli ürünleri {calisan.ad} üzerine aktar.</span>
                        </label>
                      )}
                      <Button variant="accent" onClick={zimmetle} disabled={islemBusy || (devirVar && !devirOnayi)} className="w-full sm:w-auto sm:min-w-[220px]">
                        {islemBusy ? <Loader2 size={17} className="animate-spin" /> : <Check size={17} />}
                        {sepet.length} ürünü zimmetle
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  {detayBusy ? <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-accent" /></div> : (
                    <>
                      <div className="border border-edge bg-card">
                        <div className="h-11 px-3 flex items-center justify-between border-b border-edge bg-field/50">
                          <span className="text-sm font-semibold">Mevcut zimmetler</span>
                          <button onClick={() => setIadeSecim(new Set((detay?.zimmetler ?? []).map(x => x.seri_id)))}
                            className="text-xs text-accent hover:underline">Tümünü seç</button>
                        </div>
                        {!detay?.zimmetler.length && <div className="p-8 text-center text-sm text-ink/45">Aktif zimmet yok</div>}
                        <div className="divide-y divide-edge/70">
                          {detay?.zimmetler.map(x => (
                            <label key={x.seri_id} className="p-3 flex items-center gap-3 cursor-pointer hover:bg-edge/20">
                              <input type="checkbox" checked={iadeSecim.has(x.seri_id)} onChange={() => iadeToggle(x.seri_id)} />
                              <UrunBilgi urun={x} />
                              <span className="ml-auto hidden sm:block text-xs text-ink/45">{tarihSaat(x.zimmet_zaman)}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                      {!!iadeSecim.size && (
                        <div className="flex flex-col sm:flex-row gap-2">
                          <input value={notu} onChange={e => setNotu(e.target.value)} placeholder="İade notu (isteğe bağlı)"
                            className="flex-1 h-10 px-3 border border-edge bg-field outline-none focus:border-accent" />
                          <Button variant="danger" onClick={iadeAl} disabled={islemBusy}>
                            {islemBusy ? <Loader2 size={16} className="animate-spin" /> : <PackageMinus size={16} />}
                            {iadeSecim.size} ürünü iade al
                          </Button>
                        </div>
                      )}
                      <div className="border border-edge">
                        <div className="h-11 px-3 flex items-center gap-2 border-b border-edge bg-field/50 text-sm font-semibold"><History size={15} /> Hareket geçmişi</div>
                        {!detay?.hareketler.length && <div className="p-6 text-center text-sm text-ink/45">Hareket kaydı yok</div>}
                        <div className="divide-y divide-edge/70 max-h-[360px] overflow-y-auto">
                          {detay?.hareketler.map(h => (
                            <div key={h.id} className="p-3 flex gap-3 text-sm">
                              <span className={cn("h-7 w-7 shrink-0 flex items-center justify-center border",
                                h.islem === "iade" ? "border-bad/40 text-bad-ink" : h.islem === "devir" ? "border-warn/40 text-warn-ink" : "border-good/40 text-good-ink")}> 
                                {h.islem === "devir" ? <ArrowLeftRight size={14} /> : h.islem === "iade" ? <PackageMinus size={14} /> : <PackageCheck size={14} />}
                              </span>
                              <div className="min-w-0 flex-1">
                                <div className="font-semibold truncate">{h.urun_adi} <span className="font-mono font-normal text-ink/55">{h.seri_no}</span></div>
                                <div className="text-xs text-ink/45">{h.islem.toLocaleUpperCase("tr-TR")} · {h.yapan || "Sistem"}{h.notu ? ` · ${h.notu}` : ""}</div>
                              </div>
                              <span className="text-xs text-ink/45 whitespace-nowrap">{tarihSaat(h.zaman)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function OzetDeger({ icon, deger, etiket }: { icon: React.ReactNode; deger: number; etiket: string }) {
  return <div className="px-3 py-2 flex items-center gap-2 border-r border-edge last:border-r-0">
    <span className="text-accent">{icon}</span><span><b className="font-mono text-sm">{deger}</b><small className="block text-[9px] uppercase tracking-label text-ink/45">{etiket}</small></span>
  </div>;
}

function ModButton({ aktif, onClick, icon, label }: { aktif: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return <button onClick={onClick} className={cn("h-8 px-3 flex items-center gap-1.5 text-xs font-semibold rounded-sm", aktif ? "bg-accent text-white" : "text-ink/60 hover:text-ink")}>{icon}{label}</button>;
}

function UrunBilgi({ urun }: { urun: ZimmetUrun }) {
  return <div className="min-w-0 flex-1">
    <div className="font-semibold text-sm truncate">{urun.urun_adi}</div>
    <div className="flex flex-wrap gap-x-3 text-xs text-ink/50"><span>{urun.stok_kodu}</span><span className="font-mono text-ink/75">{urun.seri_no}</span><span>{urun.depo_ad || "Depo yok"}</span></div>
  </div>;
}
