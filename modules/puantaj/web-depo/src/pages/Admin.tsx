import { ChangeEvent, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Key, Trash2, UserPlus, Power, PackagePlus, LogOut as LogOutIcon, Archive } from "lucide-react";
import AuditLogPanel from "../components/AuditLogPanel";
import { api, AuditSatir, Oturum, User } from "../lib/api";
import { useToast } from "../lib/toast";
import { useAuth } from "../lib/auth";
import { cn } from "../lib/cn";
import PanelHeader from "../components/ui/PanelHeader";
import { Button } from "../components/ui/Button";
import StatusBadge, { OTURUM_DURUM } from "../components/ui/StatusBadge";

export default function Admin() {
  const toast = useToast();
  const { user: me } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [oturumlar, setOturumlar] = useState<Oturum[]>([]);
  const [audit, setAudit] = useState<AuditSatir[]>([]);
  const [yeniAd, setYeniAd] = useState("");
  const [yeniPin, setYeniPin] = useState("");
  const [yeniRol, setYeniRol] = useState("sayan");
  const [secOturum, setSecOturum] = useState<number | null>(null);
  const [devam, setDevam] = useState(false);
  const [yuklenen, setYuklenen] = useState<string | null>(null);
  const [topluMetin, setTopluMetin] = useState("");
  const [topluNot, setTopluNot] = useState("");
  const [topluSonuc, setTopluSonuc] = useState<string | null>(null);

  async function refresh() {
    try {
      const [u, o, a] = await Promise.all([
        api.users(),
        api.oturumlar(true),
        api.audit(undefined, undefined, 30, 0),
      ]);
      setUsers(u); setOturumlar(o); setAudit(a.items);
      if (!secOturum && o.length) setSecOturum(o.find(x => x.durum === "aktif")?.id ?? o[0].id);
    } catch (e: any) { toast.push("err", e.message); }
  }
  useEffect(() => { refresh(); }, []);

  async function ekleKullanici() {
    if (!yeniAd.trim()) { toast.push("warn", "Ad boş olamaz"); return; }
    if (yeniPin.length < 4) { toast.push("warn", "PIN en az 4 karakter"); return; }
    try {
      await api.createUser(yeniAd, yeniPin, yeniRol);
      setYeniAd(""); setYeniPin(""); setYeniRol("sayan");
      toast.push("ok", "Kullanıcı eklendi");
      refresh();
    } catch (e: any) { toast.push("err", e.message); }
  }

  async function pinReset(u: User) {
    const p = prompt(`${u.ad} için yeni PIN (en az 4 karakter):`);
    if (!p || p.length < 4) { if (p !== null) toast.push("warn", "PIN en az 4 karakter"); return; }
    try { await api.pinReset(u.id, p); toast.push("ok", `${u.ad} PIN sıfırlandı`); }
    catch (e: any) { toast.push("err", e.message); }
  }

  async function toggleAktif(u: User) {
    try { await api.updateUser(u.id, { aktif: !u.aktif }); toast.push("ok", "Durum güncellendi"); refresh(); }
    catch (e: any) { toast.push("err", e.message); }
  }

  async function silKullanici(u: User) {
    if (!confirm(`${u.ad} pasif yapılsın mı?`)) return;
    try { await api.silUser(u.id); toast.push("ok", "Pasif yapıldı"); refresh(); }
    catch (e: any) { toast.push("err", e.message); }
  }

  async function silOturum(o: Oturum) {
    if (!confirm(`"${o.ad}" oturumu silinsin mi? Tüm veri kaybolur.`)) return;
    try { await api.oturumSil(o.id); toast.push("ok", "Oturum silindi"); refresh(); }
    catch (e: any) { toast.push("err", e.message); }
  }

  async function arsivleOturum(o: Oturum) {
    try { await api.oturumArsivle(o.id); toast.push("ok", "Arşivlendi"); refresh(); }
    catch (e: any) { toast.push("err", e.message); }
  }

  async function dosyaSec(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f || !secOturum) return;
    setYuklenen("Yükleniyor...");
    try {
      const r = await api.excelYukle(secOturum, f, devam);
      const parts = [
        `Sayfa: ${r.sayfa}`,
        `Stok: ${r.eklenen_stok}`,
        `Seri: ${r.eklenen_seri}`,
        `Mükerrer: ${r.mukerrer_seri}`,
        `Çakışmalı seri: ${r.cakismali_seri}`,
        `Hatalı satır: ${r.hatali_satir}`,
        `Junk: ${r.atlanan_junk_header}`,
      ];
      if (r.devam_modu) parts.push(`Önceden sayılan: ${r.onceden_sayilan_olarak_isaretlenen}`);
      if (r.supheli_onceki_sayim) parts.push(`Şüpheli eski sayım: ${r.supheli_onceki_sayim}`);
      setYuklenen(parts.join(" · "));
      toast.push("ok", `${r.eklenen_seri} seri eklendi`);
    } catch (err: any) { setYuklenen(null); toast.push("err", err.message); }
    finally { e.target.value = ""; }
  }

  function _seriListesi(): string[] {
    return topluMetin.split(/[\r\n,;]+/).map(s => s.trim()).filter(Boolean);
  }

  function _giris_satirlari() {
    const out: { stok_kodu: string; urun_adi?: string; seri_no: string; portal_sayim?: number }[] = [];
    topluMetin.split(/\r?\n/).forEach(line => {
      const s = line.trim();
      if (!s) return;
      const hasDelim = /[\t;,]/.test(s);
      const parts = hasDelim
        ? s.split(/[\t;,]/).map(p => p.trim()).filter(Boolean)
        : s.split(/\s+/);
      if (parts.length === 2) {
        out.push({ stok_kodu: parts[0], seri_no: parts[1] });
      } else if (parts.length === 3) {
        out.push({ stok_kodu: parts[0], urun_adi: parts[1], seri_no: parts[2] });
      } else if (parts.length >= 4) {
        out.push({ stok_kodu: parts[0], urun_adi: parts[1], seri_no: parts[2], portal_sayim: Number(parts[3]) || 0 });
      }
    });
    return out;
  }

  async function topluGirisCalistir() {
    if (!secOturum) { toast.push("warn", "Oturum seç"); return; }
    const satirlar = _giris_satirlari();
    if (!satirlar.length) { toast.push("warn", "Format: STOK,ÜRÜN,SERİ,PORTAL (her satır)"); return; }
    try {
      const r = await api.topluGiris(secOturum, satirlar);
      setTopluSonuc(`Giriş -> stok+${r.yeni_stok}, seri+${r.yeni_seri}, mükerrer ${r.mukerrer}, boş ${r.bos}`);
      toast.push("ok", "Toplu giriş tamam"); refresh();
    } catch (e: any) { toast.push("err", e.message); }
  }
  async function topluCikisCalistir() {
    if (!secOturum) { toast.push("warn", "Oturum seç"); return; }
    const seriler = _seriListesi();
    if (!seriler.length) { toast.push("warn", "Seri no listesi boş"); return; }
    try {
      const r = await api.topluCikis(secOturum, seriler, topluNot || undefined);
      setTopluSonuc(`Çıkış -> ${r.isaretlenen} işaretlendi, ${r.zaten_cikis} zaten çıkış, ${r.bulunamadi.length} bulunamadı`);
      toast.push("ok", "Çıkış tamam"); refresh();
    } catch (e: any) { toast.push("err", e.message); }
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="text-[11px] uppercase tracking-label text-ink/55">Admin paneli</div>
        <h2 className="font-display text-3xl">Sistem yönetimi</h2>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <section className="card p-4 space-y-3">
          <h3 className="text-[15px] font-semibold">Excel ile stok yükle</h3>
          <label className="block text-sm">
            Oturum
            <select className="mt-1 w-full h-10 px-3 rounded-[10px] border border-edge bg-field"
              value={secOturum ?? ""} onChange={e => setSecOturum(Number(e.target.value))}>
              {oturumlar.filter(o => o.durum === "aktif").map(o => (
                <option key={o.id} value={o.id}>{o.ad}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={devam} onChange={e => setDevam(e.target.checked)} />
            Devam modu (I/J/K kolonundan eski sayım durumunu yükle)
          </label>
          <label className="block text-sm">
            Dosya (.xlsx / .xlsm)
            <input type="file" accept=".xlsx,.xlsm" onChange={dosyaSec}
              className="mt-1 w-full text-sm" />
          </label>
          {yuklenen && <div className="text-sm text-good-ink break-all">{yuklenen}</div>}
          <div className="text-xs text-ink/55">
            Sayfa otomatik tespit (sistem sayfaları atlanır). Junk header ("Stok Kod") atlanır.
            Stok kodu sayısalsa metne çevrilir. Portal D, yoksa E'den okunur.
          </div>
        </section>

        <section className="card p-4 space-y-3">
          <h3 className="text-[15px] font-semibold flex items-center gap-2">
            <UserPlus size={16} className="text-accent" /> Yeni kullanıcı
          </h3>
          <div className="grid grid-cols-2 gap-2">
            <input className="h-10 px-3 rounded-[10px] border border-edge" placeholder="Ad"
              value={yeniAd} onChange={e => setYeniAd(e.target.value)} />
            <input className="h-10 px-3 rounded-[10px] border border-edge" placeholder="PIN (>=4)" type="password"
              value={yeniPin} onChange={e => setYeniPin(e.target.value)} />
            <select className="h-10 px-3 rounded-[10px] border border-edge bg-field"
              value={yeniRol} onChange={e => setYeniRol(e.target.value)}>
              <option value="sayan">Sayan</option>
              <option value="izleyici">İzleyici</option>
              <option value="admin">Admin</option>
            </select>
            <Button variant="primary" onClick={ekleKullanici}>Ekle</Button>
          </div>
        </section>
      </div>

      <section className="card p-4 space-y-3">
        <h3 className="text-[15px] font-semibold flex items-center gap-2">
          <PackagePlus size={16} className="text-accent" /> Toplu işlemler
        </h3>
        <div className="grid md:grid-cols-2 gap-2 text-sm">
          <label>
            <span className="text-[11px] uppercase tracking-label text-ink/55">Oturum</span>
            <select className="mt-1 w-full h-10 px-3 rounded-[10px] border border-edge bg-field"
              value={secOturum ?? ""} onChange={e => setSecOturum(Number(e.target.value))}>
              {oturumlar.map(o => <option key={o.id} value={o.id}>{o.ad} ({OTURUM_DURUM[o.durum]?.label ?? o.durum})</option>)}
            </select>
          </label>
          <label>
            <span className="text-[11px] uppercase tracking-label text-ink/55">Not (opsiyonel)</span>
            <input className="mt-1 w-full h-10 px-3 rounded-[10px] border border-edge bg-field"
              value={topluNot} onChange={e => setTopluNot(e.target.value)} placeholder="Çıkış sebebi" />
          </label>
        </div>
        <textarea value={topluMetin} onChange={e => setTopluMetin(e.target.value)}
          rows={6}
          className="w-full px-3 py-2 rounded-[10px] border border-edge bg-field font-mono text-sm"
          placeholder={"GİRİŞ: STOK SERİ (örn: 10036 ST878787) veya STOK,ÜRÜN,SERİ[,PORTAL]\nÇIKIŞ: her satır bir SERİ"} />
        <div className="flex gap-2 flex-wrap">
          <Button variant="primary" size="sm" onClick={topluGirisCalistir}>
            <PackagePlus size={14} /> Toplu giriş
          </Button>
          <Button variant="danger" size="sm" onClick={topluCikisCalistir}>
            <LogOutIcon size={14} /> Toplu çıkış
          </Button>
        </div>
        {topluSonuc && <div className="text-sm text-good-ink break-all">{topluSonuc}</div>}
        <div className="text-[11px] text-ink/55">
          Giriş örnek: <code className="font-mono">10036,NEW OSMOS,SR12345,15</code> · Çıkış: her satır bir seri.
        </div>
      </section>

      <section className="card overflow-hidden">
        <PanelHeader title="Kullanıcılar" meta={String(users.length)} />
        <ul className="divide-y divide-edge/40">
          <AnimatePresence>
            {users.map(u => (
              <motion.li key={u.id}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className={cn("flex items-center gap-3 p-3 hover:bg-cream/60 transition-colors", !u.aktif && "opacity-60")}>
                <div className="h-9 w-9 rounded-full bg-deep text-white flex items-center justify-center font-bold shrink-0">
                  {u.ad.slice(0,1).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium">{u.ad}{u.id === me?.id && <span className="ml-2 text-xs text-ink/55">(sen)</span>}</div>
                  <div className="text-xs text-ink/55">{u.rol}{!u.aktif && " · pasif"}</div>
                </div>
                <Button variant="quiet" size="sm" onClick={() => pinReset(u)} title="PIN sıfırla">
                  <Key size={14} />
                </Button>
                <Button variant="quiet" size="sm" onClick={() => toggleAktif(u)} disabled={u.id === me?.id}
                  title={u.aktif ? "Pasif yap" : "Aktif yap"}
                  className={u.aktif ? "text-good-ink" : "text-bad-ink"}>
                  <Power size={14} />
                </Button>
                <Button variant="quiet" size="sm" onClick={() => silKullanici(u)} disabled={u.id === me?.id}
                  title="Pasif yap" className="text-bad-ink">
                  <Trash2 size={14} />
                </Button>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      </section>

      <section className="card overflow-hidden">
        <PanelHeader title="Oturumlar (arşiv dahil)" meta={String(oturumlar.length)} />
        <ul className="divide-y divide-edge/40 max-h-80 overflow-auto">
          {oturumlar.map(o => (
            <li key={o.id} className="p-3 flex items-center gap-3 hover:bg-cream/60 transition-colors">
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{o.ad}</div>
                <div className="text-xs text-ink/55">{o.lokasyon ?? "-"} · {new Date(o.baslangic).toLocaleString("tr-TR")}</div>
              </div>
              <StatusBadge
                label={OTURUM_DURUM[o.durum]?.label ?? o.durum.toUpperCase()}
                tone={OTURUM_DURUM[o.durum]?.tone ?? "neutral"}
              />
              {o.durum === "tamamlandi" && (
                <Button variant="quiet" size="sm" onClick={() => arsivleOturum(o)} title="Arşivle">
                  <Archive size={14} />
                </Button>
              )}
              <Button variant="quiet" size="sm" onClick={() => silOturum(o)} title="Kalıcı sil" className="text-bad-ink">
                <Trash2 size={14} />
              </Button>
            </li>
          ))}
          {oturumlar.length === 0 && (
            <li className="p-6 text-center text-ink/55">Oturum yok.</li>
          )}
        </ul>
      </section>

      <AuditLogPanel users={users} />
    </div>
  );
}
