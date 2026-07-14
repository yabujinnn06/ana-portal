import { Component, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity, AlertCircle, AlertTriangle, AppWindow, BarChart3, Bell, Bug, CalendarDays, CarFront, Check,
  CheckCircle2, ChevronRight, CloudCog, Command, Cpu, CreditCard, Download, FileCheck2,
  FileText, Folder, FolderOpen, FolderPlus, Gauge, Grid2X2, HardDrive, Home,
  Image, KeyRound, LayoutDashboard, LayoutGrid, List, LogOut, Maximize2, Minimize2,
  Monitor, MoreHorizontal, Move, Network, PanelLeftClose, PanelLeftOpen, Plus, Power,
  Palette, ReceiptText, RefreshCw, Search, Settings, ShieldCheck, Sparkles, Terminal,
  Trash2, UserRound, Warehouse, X, type LucideIcon,
} from "lucide-react";

type Tenant = { id: string; slug: string; name: string; status: string };
type User = { id: string; email: string; full_name: string; role: string; permissions: string[]; platform_admin: boolean };
type Module = { code: string; name: string; description: string; category: string; monthly_price: string; currency: string; core: boolean; enabled: boolean; source: string };
type Plan = { code: string; name: string; description: string; monthly_base_price: string; currency: string; included_users: number; modules: string[] };
type Overview = { tenant: Tenant; plan: Plan | null; modules: Module[]; monthly_total: string; users_count: number; verified_domains: number; security_score: number };
type Session = { access_token: string; expires_in: number; tenant: Tenant; user: User };
type ModuleLaunch = { launch_url: string; ticket: string; expires_in: number; module_code: string };
type Props = { session: Session; overview: Overview | null; catalog: Plan[]; loading: boolean; error: string; onReload: () => Promise<void>; onToggleModule: (module: Module) => Promise<void>; onSelectPlan: (code: string) => Promise<void>; onLaunchModule: (module: Module) => Promise<ModuleLaunch>; onLogout: () => void };
type NativeSpec = { color: string; icon: LucideIcon; eyebrow: string; metrics: [string, string, string][]; columns: string[]; rows: string[][]; notices: string[] };
type Point = { x: number; y: number };
type DesktopWidget = "status" | "agenda" | "notes" | "storage";
type ThemeMode = "light" | "dark";
type SystemLogLevel = "info" | "warning" | "error";
type SystemLogEntry = { id: string; level: SystemLogLevel; source: string; message: string; detail?: string; timestamp: string };

const SYSTEM_LOG_KEY = "rainwater_one_system_logs";
const SYSTEM_LOG_EVENT = "rainwater-system-log";
const readSystemLogs = (): SystemLogEntry[] => {
  try { return JSON.parse(localStorage.getItem(SYSTEM_LOG_KEY) || "[]"); } catch { return []; }
};
const recordSystemLog = (level: SystemLogLevel, source: string, message: string, detail = "") => {
  if (typeof window === "undefined") return;
  const previous = readSystemLogs();
  const latest = previous[0];
  if (latest && latest.level === level && latest.source === source && latest.message === message && Date.now() - new Date(latest.timestamp).getTime() < 750) return;
  const entry: SystemLogEntry = { id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`, level, source, message, detail: detail.slice(0, 4000), timestamp: new Date().toISOString() };
  const next = [entry, ...previous].slice(0, 250);
  localStorage.setItem(SYSTEM_LOG_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent<SystemLogEntry>(SYSTEM_LOG_EVENT, { detail: entry }));
};

class DesktopErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error) { recordSystemLog("error", "desktop", error.message, error.stack || ""); }
  render() {
    if (this.state.failed) return <div className="nx-desktop-recovery"><ShieldCheck /><h2>Masaüstü güvenli moda alındı</h2><p>Geçici çalışma durumu temizlenerek masaüstü yeniden başlatılabilir.</p><button onClick={() => { localStorage.removeItem("rainwater_desktop_positions"); window.location.reload(); }}><RefreshCw />Masaüstünü yeniden başlat</button></div>;
    return this.props.children;
  }
}

const REAL_APPS = new Set(["attendance", "offers"]);
const APP_ICONS: Record<string, LucideIcon> = {
  attendance: Activity, offers: FileCheck2, warehouse: Warehouse, fleet: CarFront,
  analytics: BarChart3, api_access: CloudCog, platform: Grid2X2, files: FolderOpen, settings: Settings, logs: Terminal,
};
const APP_COLORS: Record<string, string> = {
  attendance: "#54bba2", offers: "#df7e68", warehouse: "#62a9d1",
  fleet: "#8795e4", analytics: "#ae86df", api_access: "#55b5c0", files: "#2c8eb5", settings: "#56849a", logs: "#42b98a",
};
const money = (value: string | number) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(Number(value));

function Logo({ size = "small" }: { size?: "tiny" | "small" | "large" }) {
  return <span className={`rw-logo ${size}`} aria-hidden="true">RW</span>;
}

const NATIVE_SPECS: Record<string, NativeSpec> = {
  warehouse: {
    color: "#62a9d1", icon: Warehouse, eyebrow: "LOJİSTİK / CANLI STOK",
    metrics: [["Stok kalemi", "1.248", "3 depo"], ["Kritik stok", "12", "Aksiyon gerekli"], ["Transfer", "4", "Yolda"], ["Stok değeri", "₺5,8 Mn", "Güncel maliyet"]],
    columns: ["Kod", "Ürün", "Miktar", "Durum"],
    rows: [["RW-10024", "Endüstriyel Filtre", "184 Adet", "Yeterli"], ["RW-20518", "Pompa Motoru 2.2kW", "8 Adet", "Kritik"], ["RW-30142", "Paslanmaz Bağlantı", "426 Adet", "Yeterli"], ["RW-40811", "Kontrol Kartı", "14 Adet", "Azalıyor"], ["RW-50227", "Basınç Sensörü", "62 Adet", "Yeterli"]],
    notices: ["12 ürün minimum seviyenin altında", "Merkez → Saha transferi yolda", "Aylık sayım 18 Temmuz'da"],
  },
  fleet: {
    color: "#8795e4", icon: CarFront, eyebrow: "SAHA / FİLO KONTROLÜ",
    metrics: [["Aktif araç", "18 / 21", "Sahada"], ["Serviste", "2", "1 araç yarın hazır"], ["Bakım", "4", "30 gün içinde"], ["Aylık maliyet", "₺184 Bin", "Yakıt + bakım"]],
    columns: ["Plaka", "Araç", "Sürücü", "Durum"],
    rows: [["34 RW 1042", "Ford Transit", "Can Arslan", "Sahada"], ["34 RW 1088", "Renault Express", "Emre Polat", "Serviste"], ["06 RW 214", "Toyota Corolla", "Ayşe Demir", "Sahada"], ["35 RW 762", "Fiat Doblo", "Mert Kaya", "Parkta"], ["34 RW 1196", "Ford Courier", "Selin Aydın", "Görevde"]],
    notices: ["34 RW 1088 servis çıkışı bekliyor", "4 periyodik bakım yaklaşıyor", "2 HGS bakiyesi düşük"],
  },
  analytics: {
    color: "#ae86df", icon: BarChart3, eyebrow: "YÖNETİM / BİRLEŞİK ANALİTİK",
    metrics: [["Aktif rapor", "12", "6 otomatik"], ["Veri kaynağı", "6", "Bağlı"], ["Son yenileme", "2 dk", "Önce"], ["Uyarı", "3", "İncelenmeli"]],
    columns: ["Rapor", "Sahibi", "Yenilenme", "Durum"],
    rows: [["Haftalık Operasyon Özeti", "Yönetim", "Pazartesi", "Güncel"], ["Satış Dönüşüm Analizi", "Satış", "Günlük", "Güncel"], ["Stok Yaşlandırma", "Operasyon", "6 saatte bir", "Güncel"], ["Personel Maliyet Trendi", "Finans", "Aylık", "Hazırlanıyor"]],
    notices: ["Kritik stok maliyeti %8 arttı", "Teklif dönüşümü hedefin üzerinde", "Filo yakıt maliyeti incelenmeli"],
  },
  api_access: {
    color: "#55b5c0", icon: Network, eyebrow: "SİSTEM / BAĞLANTILAR",
    metrics: [["Bağlantı", "5", "Sağlıklı"], ["Webhook", "14", "12 etkin"], ["Başarı", "%99,8", "Son 24 saat"], ["Olay", "24,6 Bin", "Bu ay"]],
    columns: ["Bağlantı", "Tür", "Son senkron", "Durum"],
    rows: [["Logo Muhasebe", "ERP", "4 dk önce", "Bağlı"], ["Rain Teklif", "Operasyon", "1 dk önce", "Bağlı"], ["Puantaj MVP", "İK", "2 dk önce", "Bağlı"], ["Power BI", "Analitik", "18 dk önce", "Bağlı"]],
    notices: ["Tüm kritik servisler yanıt veriyor", "1 anahtar 14 gün içinde yenilenecek", "Webhook hata oranı %0,2"],
  },
};

function AppGlyph({ code, size = "normal" }: { code: string; size?: "normal" | "large" }) {
  const Icon = APP_ICONS[code] || AppWindow;
  return <span className={`nx-app-glyph ${size}`} style={{ "--app-color": APP_COLORS[code] || "#7ea1b3" } as CSSProperties}><Icon /></span>;
}

function EmbeddedApplication({ module, handoff, busy, error, retry }: { module: Module; handoff?: ModuleLaunch; busy: boolean; error?: string; retry: () => void }) {
  const form = useRef<HTMLFormElement>(null);
  const submittedTicket = useRef("");
  useEffect(() => {
    if (handoff && submittedTicket.current !== handoff.ticket) {
      submittedTicket.current = handoff.ticket;
      form.current?.submit();
    }
  }, [handoff]);
  const target = `rainwater-runtime-${module.code}`;
  if (error) return <div className="nx-runtime-state"><ShieldCheck /><h2>{module.name} başlatılamadı</h2><p>{error}</p><button onClick={retry}><RefreshCw />Yeniden bağlan</button></div>;
  if (busy || !handoff) return <div className="nx-runtime-state loading"><span>rw</span><i /><h2>{module.name} hazırlanıyor</h2><p>Şirket oturumu güvenli biçimde aktarılıyor.</p></div>;
  return <div className="nx-runtime"><div className="nx-runtime-bar"><span><i />CANLI UYGULAMA</span><p>{module.name}<small>tek oturum · yerel servis</small></p><em><ShieldCheck />Güvenli</em></div><form ref={form} method="POST" action={handoff.launch_url} target={target}><input type="hidden" name="ticket" value={handoff.ticket} /></form><iframe name={target} title={`${module.name} uygulaması`} allow="clipboard-read; clipboard-write; geolocation; camera" /></div>;
}

function NativeApplication({ module }: { module: Module }) {
  const spec = NATIVE_SPECS[module.code];
  if (!spec) return <div className="nx-runtime-state"><Terminal /><h2>{module.name}</h2><p>Bu çalışma alanı yapılandırılıyor.</p></div>;
  const Icon = spec.icon;
  return <div className="nx-native" style={{ "--module-color": spec.color } as CSSProperties}>
    <header><span><Icon /></span><div><small>{spec.eyebrow}</small><h1>{module.name}</h1><p>{module.description}</p></div><button><Sparkles />Yeni işlem</button></header>
    <section className="nx-native-metrics">{spec.metrics.map(item => <article key={item[0]}><small>{item[0]}</small><strong>{item[1]}</strong><span>{item[2]}</span></article>)}</section>
    <section className="nx-native-grid"><div className="nx-data-panel"><header><div><small>CANLI VERİ</small><h2>Güncel kayıtlar</h2></div><label><Search /><input placeholder="Kayıtlarda ara" /></label></header><div className="nx-data-row head">{spec.columns.map(item => <span key={item}>{item}</span>)}</div>{spec.rows.map((row, index) => <div className="nx-data-row" key={`${row[0]}-${index}`}>{row.map((cell, cellIndex) => <span className={cellIndex === 3 ? "status" : ""} key={cellIndex}>{cell}</span>)}</div>)}</div><aside className="nx-context-panel"><header><Gauge /><div><small>DURUM MERKEZİ</small><h2>İzlenmesi gerekenler</h2></div></header>{spec.notices.map((notice, index) => <button key={notice}><b>{String(index + 1).padStart(2, "0")}</b><span>{notice}</span><ChevronRight /></button>)}<footer><Check /><p><b>Sistem senkron</b><small>Son kontrol 2 dakika önce</small></p></footer></aside></section>
  </div>;
}

const FILES: Record<string, { name: string; kind: "folder" | "file"; detail: string; icon?: LucideIcon }[]> = {
  "Ana Dizin": [
    { name: "Belgeler", kind: "folder", detail: "12 öğe" }, { name: "Raporlar", kind: "folder", detail: "8 öğe" },
    { name: "Teklifler", kind: "folder", detail: "24 öğe" }, { name: "Personel", kind: "folder", detail: "6 öğe" },
    { name: "Temmuz Operasyon Özeti.pdf", kind: "file", detail: "2,4 MB", icon: FileText },
    { name: "Rainwater Kurumsal.png", kind: "file", detail: "840 KB", icon: Image },
  ],
  Belgeler: [{ name: "Şirket Prosedürleri", kind: "folder", detail: "5 öğe" }, { name: "İş Sağlığı Talimatı.pdf", kind: "file", detail: "1,8 MB", icon: FileText }, { name: "Onay Akışı.docx", kind: "file", detail: "420 KB", icon: FileText }],
  Raporlar: [{ name: "2026", kind: "folder", detail: "7 öğe" }, { name: "Haftalık Operasyon.pdf", kind: "file", detail: "3,1 MB", icon: FileText }, { name: "Puantaj Özeti.xlsx", kind: "file", detail: "680 KB", icon: FileText }],
  Teklifler: [{ name: "Onaylananlar", kind: "folder", detail: "18 öğe" }, { name: "Bekleyenler", kind: "folder", detail: "7 öğe" }, { name: "RW-2026-0713.pdf", kind: "file", detail: "1,2 MB", icon: FileText }],
  Personel: [{ name: "Özlük Belgeleri", kind: "folder", detail: "48 öğe" }, { name: "İzin Formları", kind: "folder", detail: "16 öğe" }],
};

function FileExplorer() {
  const [folder, setFolder] = useState("Ana Dizin");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [selected, setSelected] = useState("");
  const [query, setQuery] = useState("");
  const entries = (FILES[folder] || FILES["Ana Dizin"]).filter(item => item.name.toLocaleLowerCase("tr").includes(query.toLocaleLowerCase("tr")));
  return <div className="nx-files">
    <header className="nx-files-toolbar"><button onClick={() => setFolder("Ana Dizin")} title="Ana dizin"><Home /></button><button onClick={() => setFolder("Ana Dizin")} title="Geri"><ChevronRight className="back" /></button><div className="nx-breadcrumb"><FolderOpen /><span>rain</span><ChevronRight /><b>{folder}</b></div><label><Search /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Bu konumda ara" /></label><button className={view === "grid" ? "active" : ""} onClick={() => setView("grid")}><LayoutGrid /></button><button className={view === "list" ? "active" : ""} onClick={() => setView("list")}><List /></button><button><MoreHorizontal /></button></header>
    <aside className="nx-files-sidebar"><small>YERLER</small>{[{ name: "Ana Dizin", icon: Home }, { name: "Belgeler", icon: FileText }, { name: "Raporlar", icon: BarChart3 }, { name: "Teklifler", icon: FileCheck2 }, { name: "Personel", icon: Activity }].map(item => <button className={folder === item.name ? "active" : ""} onClick={() => { setFolder(item.name); setSelected(""); }} key={item.name}><item.icon />{item.name}</button>)}<small>AYGITLAR</small><button><HardDrive />Rain Disk <span>%42</span></button><div className="nx-storage-meter"><i /></div><footer><ShieldCheck /><span><b>Şirket kasası</b><small>Yerel ve korumalı</small></span></footer></aside>
    <main className={`nx-file-content ${view}`}><header><div><small>KONUM</small><h1>{folder}</h1><p>{entries.length} öğe · Rainwater şirket alanı</p></div><button><FolderPlus />Yeni klasör</button></header><section>{entries.map(item => { const Icon = item.icon || FileText; return <button className={selected === item.name ? "selected" : ""} onClick={() => setSelected(item.name)} onDoubleClick={() => item.kind === "folder" && setFolder(item.name)} key={item.name}><span className={item.kind}>{item.kind === "folder" ? <Folder /> : <Icon />}</span><p><b>{item.name}</b><small>{item.detail}</small></p><MoreHorizontal /></button>; })}</section>{!entries.length && <div className="nx-files-empty"><Search /><b>Eşleşen öğe yok</b><small>Arama ifadesini değiştirmeyi deneyin.</small></div>}</main>
    <footer className="nx-files-status"><span>{selected || `${entries.length} öğe`}</span><span><HardDrive />98,4 GB kullanılabilir</span></footer>
  </div>;
}

type SettingsTab = "general" | "appearance" | "subscription" | "account" | "security" | "notifications" | "storage";

function SettingsApplication({ overview, session, catalog, theme, setTheme, orbitEnabled, setOrbitEnabled, reducedMotion, setReducedMotion, initialTab, onToggleModule, onSelectPlan, onLogout }: { overview: Overview; session: Session; catalog: Plan[]; theme: ThemeMode; setTheme: (theme: ThemeMode) => void; orbitEnabled: boolean; setOrbitEnabled: (value: boolean) => void; reducedMotion: boolean; setReducedMotion: (value: boolean) => void; initialTab: SettingsTab; onToggleModule: (module: Module) => Promise<void>; onSelectPlan: (code: string) => Promise<void>; onLogout: () => void }) {
  const [tab, setTab] = useState<SettingsTab>(initialTab);
  useEffect(() => setTab(initialTab), [initialTab]);
  const [mailNotices, setMailNotices] = useState(true);
  const [desktopNotices, setDesktopNotices] = useState(true);
  const [planBusy, setPlanBusy] = useState("");
  const [moduleBusy, setModuleBusy] = useState("");
  const [subscriptionError, setSubscriptionError] = useState("");
  const tabs: { id: SettingsTab; label: string; icon: LucideIcon }[] = [
    { id: "general", label: "Genel", icon: Settings }, { id: "appearance", label: "Görünüm", icon: Palette },
    { id: "subscription", label: "Abonelik", icon: CreditCard }, { id: "account", label: "Hesap", icon: UserRound },
    { id: "security", label: "Güvenlik", icon: ShieldCheck }, { id: "notifications", label: "Bildirimler", icon: Bell },
    { id: "storage", label: "Depolama", icon: HardDrive },
  ];
  const Toggle = ({ value, setValue }: { value: boolean; setValue: (value: boolean) => void }) => <button className={`nx-setting-toggle ${value ? "on" : ""}`} onClick={() => setValue(!value)} aria-pressed={value}><span /></button>;
  const selectPlan = async (code: string) => { setPlanBusy(code); setSubscriptionError(""); try { await onSelectPlan(code); } catch (changeError) { setSubscriptionError(changeError instanceof Error ? changeError.message : "Paket değiştirilemedi"); } finally { setPlanBusy(""); } };
  const toggleModule = async (module: Module) => { setModuleBusy(module.code); setSubscriptionError(""); try { await onToggleModule(module); } catch (changeError) { setSubscriptionError(changeError instanceof Error ? changeError.message : "Uygulama durumu değiştirilemedi"); } finally { setModuleBusy(""); } };
  return <div className="nx-settings-app">
    <aside><header><Logo size="small" /><div><small>RAINWATER ONE</small><b>Ayarlar</b></div></header><nav>{tabs.map(item => <button className={tab === item.id ? "active" : ""} onClick={() => setTab(item.id)} key={item.id}><item.icon />{item.label}<ChevronRight /></button>)}</nav><footer><span>{session.user.full_name.slice(0, 2).toLocaleUpperCase("tr")}</span><p><b>{session.user.full_name}</b><small>{session.user.email}</small></p></footer></aside>
    <main><header><div><small>SİSTEM AYARLARI</small><h1>{tabs.find(item => item.id === tab)?.label}</h1></div><span><i />Tüm servisler çalışıyor</span></header>
      {tab === "general" && <section className="nx-settings-page"><article className="nx-settings-hero"><Logo size="large" /><div><small>RAINWATER ONE</small><h2>{overview.tenant.name}</h2><p>Şirket uygulamaları, abonelik ve yerel servisler tek çalışma sistemi altında yönetiliyor.</p></div><button onClick={() => window.location.reload()}><RefreshCw />Sistemi yenile</button></article><div className="nx-settings-cards"><article><Monitor /><p><small>SÜRÜM</small><b>Rainwater One 0.4</b><span>Güncel sürüm</span></p></article><article><ShieldCheck /><p><small>GÜVENLİK</small><b>{overview.security_score}/100</b><span>Koruma etkin</span></p></article><article><HardDrive /><p><small>YEREL SERVİSLER</small><b>4 / 4</b><span>Çevrimiçi</span></p></article></div></section>}
      {tab === "appearance" && <section className="nx-settings-page"><div className="nx-settings-section-title"><div><h2>Rainwater teması</h2><p>Çalışma sisteminin renk davranışını seçin.</p></div></div><div className="nx-theme-options">{([{ id: "light", name: "Açık", detail: "Gündüz çalışma alanı" }, { id: "dark", name: "Koyu", detail: "Gece çalışma alanı" }] as { id: ThemeMode; name: string; detail: string }[]).map(item => <button className={`${item.id} ${theme === item.id ? "active" : ""}`} onClick={() => setTheme(item.id)} key={item.id}><i /><b>{item.name}</b><small>{item.detail}</small>{theme === item.id && <CheckCircle2 />}</button>)}</div><div className="nx-setting-list"><article><span><Sparkles /></span><p><b>Masaüstü orbiti</b><small>Merkezdeki RW rozetini ve dönen halkayı gösterir.</small></p><Toggle value={orbitEnabled} setValue={setOrbitEnabled} /></article><article><span><Move /></span><p><b>Hareketleri azalt</b><small>Animasyonları ve geçişleri en düşük seviyeye indirir.</small></p><Toggle value={reducedMotion} setValue={setReducedMotion} /></article></div></section>}
      {tab === "subscription" && <section className="nx-settings-page"><article className="nx-plan-card"><header><span><ReceiptText /></span><div><small>AKTİF ABONELİK</small><h2>{overview.plan?.name || "Özel Plan"}</h2><p>{overview.plan?.description || "Rainwater şirket paketi"}</p></div><strong>{money(overview.monthly_total)}<small>/ ay</small></strong></header><div><article><small>Kullanıcı</small><b>{overview.users_count} / {overview.plan?.included_users || "∞"}</b><i><span style={{ width: `${Math.min(100, overview.users_count / Math.max(1, overview.plan?.included_users || 1) * 100)}%` }} /></i></article><article><small>Etkin uygulama</small><b>{overview.modules.filter(item => item.enabled).length}</b><span>Paket ve ek modüller</span></article><article><small>Sonraki dönem</small><b>13 Ağustos 2026</b><span>Otomatik yenileme açık</span></article></div><footer><button onClick={() => document.getElementById("nx-plan-options")?.scrollIntoView({ behavior: "smooth" })}><Sparkles />Paket seçeneklerini incele</button></footer></article>{subscriptionError && <div className="nx-settings-error">{subscriptionError}</div>}<div className="nx-settings-section-title" id="nx-plan-options"><div><h2>Paket seçenekleri</h2><p>Aboneliği bu ekrandan doğrudan değiştirebilirsiniz.</p></div></div><div className="nx-settings-plans">{catalog.map(plan => <article className={overview.plan?.code === plan.code ? "active" : ""} key={plan.code}><small>{plan.code}</small><b>{plan.name}</b><strong>{money(plan.monthly_base_price)}<span>/ ay</span></strong><p>{plan.included_users} kullanıcı · {plan.modules.length} uygulama</p><button disabled={overview.plan?.code === plan.code || planBusy === plan.code} onClick={() => void selectPlan(plan.code)}>{overview.plan?.code === plan.code ? <><Check />Aktif paket</> : planBusy === plan.code ? "Değiştiriliyor…" : "Bu pakete geç"}</button></article>)}</div><div className="nx-settings-section-title"><div><h2>Uygulama yönetimi</h2><p>Paket kapsamındaki ve ek uygulamaları açıp kapatın.</p></div></div><div className="nx-subscription-apps manage">{overview.modules.filter(module => module.code !== "platform").map(module => <article key={module.code}><AppGlyph code={module.code} /><p><b>{module.name}</b><small>{module.core ? "Pakete dahil" : `${money(module.monthly_price)} / ay`}</small></p><button className={`nx-setting-toggle ${module.enabled ? "on" : ""}`} disabled={module.core || moduleBusy === module.code} onClick={() => void toggleModule(module)} aria-label={`${module.name} ${module.enabled ? "kapat" : "aç"}`}><span /></button></article>)}</div></section>}
      {tab === "account" && <section className="nx-settings-page"><article className="nx-account-card"><span>{session.user.full_name.slice(0, 2).toLocaleUpperCase("tr")}</span><div><small>ŞİRKET YÖNETİCİSİ</small><h2>{session.user.full_name}</h2><p>{session.user.email}</p></div><button>Profili düzenle</button></article><div className="nx-setting-list"><article><span><UserRound /></span><p><b>Şirket hesabı</b><small>{overview.tenant.name} · {overview.tenant.slug}</small></p><ChevronRight /></article><article><span><KeyRound /></span><p><b>Parola ve erişim</b><small>Son giriş bugün, yerel çalışma sistemi</small></p><ChevronRight /></article><article><span><LogOut /></span><p><b>Oturumu kapat</b><small>Bu cihazdaki Rainwater oturumunu sonlandırır.</small></p><button className="nx-inline-action" onClick={onLogout}>Çıkış yap</button></article></div></section>}
      {tab === "security" && <section className="nx-settings-page"><article className="nx-security-score"><ShieldCheck /><div><small>GÜVENLİK SKORU</small><h2>{overview.security_score}/100</h2><p>Kritik güvenlik sorunu bulunmuyor.</p></div><span>Koruma etkin</span></article><div className="nx-setting-list"><article><span><KeyRound /></span><p><b>Tek oturum bağlantısı</b><small>Kısa ömürlü ve tek kullanımlık geçiş biletleri</small></p><em>Etkin</em></article><article><span><ShieldCheck /></span><p><b>Uygulama çerçeve koruması</b><small>Yalnızca Rainwater portalına izin veriliyor</small></p><em>Etkin</em></article></div></section>}
      {tab === "notifications" && <section className="nx-settings-page"><div className="nx-settings-section-title"><div><h2>Bildirim tercihleri</h2><p>Hangi olayların size ulaşacağını yönetin.</p></div></div><div className="nx-setting-list"><article><span><Bell /></span><p><b>Masaüstü bildirimleri</b><small>Teklif, puantaj ve stok uyarılarını gösterir.</small></p><Toggle value={desktopNotices} setValue={setDesktopNotices} /></article><article><span><FileText /></span><p><b>E-posta özetleri</b><small>Günlük şirket özetini e-posta ile gönderir.</small></p><Toggle value={mailNotices} setValue={setMailNotices} /></article></div></section>}
      {tab === "storage" && <section className="nx-settings-page"><article className="nx-storage-overview"><HardDrive /><div><small>RAIN DISK</small><h2>42 GB / 100 GB</h2><p>Belgeler, teklifler, raporlar ve uygulama verileri</p><i><span /></i></div><button>Alanı yönet</button></article><div className="nx-storage-breakdown">{[["Belgeler","18 GB","#0f6a8c"],["Teklifler","11 GB","#df7e68"],["Raporlar","8 GB","#8795e4"],["Diğer","5 GB","#7b96a4"]].map(item => <article key={item[0]}><i style={{ background: item[2] }} /><p><b>{item[0]}</b><small>{item[1]}</small></p><ChevronRight /></article>)}</div></section>}
    </main>
  </div>;
}

function SystemLogApplication({ logs, onClear }: { logs: SystemLogEntry[]; onClear: () => void }) {
  const [level, setLevel] = useState<"all" | SystemLogLevel>("all");
  const [query, setQuery] = useState("");
  const visible = logs.filter(item => (level === "all" || item.level === level) && `${item.source} ${item.message} ${item.detail || ""}`.toLocaleLowerCase("tr").includes(query.toLocaleLowerCase("tr")));
  const errors = logs.filter(item => item.level === "error").length;
  const warnings = logs.filter(item => item.level === "warning").length;
  const downloadLogs = () => {
    const content = logs.map(item => `[${item.timestamp}] ${item.level.toUpperCase()} ${item.source}: ${item.message}${item.detail ? `\n${item.detail}` : ""}`).join("\n\n");
    const url = URL.createObjectURL(new Blob([content || "Rainwater One sistem günlüğü boş."], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `rainwater-system-log-${new Date().toISOString().slice(0, 10)}.txt`; link.click(); URL.revokeObjectURL(url);
  };
  return <div className="nx-system-log">
    <header><div><span><Terminal /></span><p><small>RAINWATER ONE / DIAGNOSTICS</small><b>Sistem Günlüğü</b><em>Tarayıcı ve uygulama hataları bu cihazda kalıcı olarak tutulur.</em></p></div><section><article><AlertCircle /><p><b>{errors}</b><small>Hata</small></p></article><article><AlertTriangle /><p><b>{warnings}</b><small>Uyarı</small></p></article><article><CheckCircle2 /><p><b>{Math.max(0, logs.length - errors - warnings)}</b><small>Bilgi</small></p></article></section></header>
    <nav><div>{(["all", "error", "warning", "info"] as const).map(item => <button className={level === item ? "active" : ""} onClick={() => setLevel(item)} key={item}>{item === "all" ? "Tümü" : item === "error" ? "Hatalar" : item === "warning" ? "Uyarılar" : "Bilgi"}<span>{item === "all" ? logs.length : logs.filter(log => log.level === item).length}</span></button>)}</div><label><Search /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Günlükte ara" /></label><button onClick={downloadLogs}><Download />Dışa aktar</button><button className="danger" onClick={onClear}><Trash2 />Temizle</button></nav>
    <main>{visible.length ? visible.map(item => <article className={item.level} key={item.id}><time>{new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(item.timestamp))}</time><span>{item.level === "error" ? <Bug /> : item.level === "warning" ? <AlertTriangle /> : <CheckCircle2 />}</span><div><header><b>{item.source}</b><em>{item.level.toUpperCase()}</em></header><p>{item.message}</p>{item.detail && <pre>{item.detail}</pre>}</div></article>) : <section className="nx-log-empty"><CheckCircle2 /><b>Eşleşen günlük kaydı yok</b><small>Yeni hata ve uyarılar oluştuğunda burada otomatik görünecek.</small></section>}</main>
    <footer><span><i />Canlı kayıt açık</span><p>Son {logs.length} kayıt · en fazla 250 kayıt cihazda saklanır</p><kbd>RAINWATER-SYSLOG</kbd></footer>
  </div>;
}

const LOG_SOURCE_LABELS: Record<string, string> = {
  "portal.window": "Portal", "portal.promise": "Portal", "browser.console": "Tarayıcı",
  desktop: "Masaüstü", "rainwater.system": "Sistem",
};

function orbitSourceLabel(source: string): string {
  const [kind, rest] = source.split(".");
  if (kind === "module" && rest) return rest;
  return LOG_SOURCE_LABELS[source] || source;
}

const ORBIT_SATELLITE_SLOTS = ["outer", "mid", "inner"] as const;

function OrbitPet({ session, logs, open }: { session: Session; logs: SystemLogEntry[]; open: (code: string) => void }) {
  const activity = useMemo(() => {
    const seen = new Set<string>();
    const items: { code: string; label: string; detail: string; level: SystemLogLevel }[] = [];
    for (const log of logs) {
      const key = log.source;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({ code: key, label: orbitSourceLabel(log.source), detail: log.message, level: log.level });
      if (items.length >= ORBIT_SATELLITE_SLOTS.length) break;
    }
    return items;
  }, [logs]);
  const initials = session.user.full_name.slice(0, 2).toLocaleUpperCase("tr");
  return <button className="nx-orbit-core" onClick={() => open("logs")} title="Sistem etkinliğini görüntüle">
    <span className="nx-orb-scene">
      <span className="nx-orb-shadow" />
      <span className="nx-orb-nebula back" /><span className="nx-orb-nebula front" />
      <span className="nx-orb-aura" />
      <span className="nx-orb-orbit outer" /><span className="nx-orb-orbit mid" /><span className="nx-orb-orbit inner" /><span className="nx-orb-orbit polar" />
      {ORBIT_SATELLITE_SLOTS.map((slot, index) => { const item = activity[index]; return <span className={`nx-orb-satellite ${slot} ${item?.level || ""}`} key={slot} title={item ? `${item.label}: ${item.detail}` : "Etkinlik bekleniyor"}><span className="nx-orb-satellite-core" /></span>; })}
      <span className="nx-orb-planet">
        <span className="nx-orb-depth" /><span className="nx-orb-halo" /><span className="nx-orb-ring back" />
        <span className="nx-orb-core"><strong className="nx-orb-monogram">RW</strong><span className="nx-orb-brand">RAINWATER</span><span className="nx-orb-sub">ONE</span></span>
        <span className="nx-orb-ring front" />
        <i className="nx-orb-spark a" /><i className="nx-orb-spark b" />
      </span>
    </span>
    <span className="nx-orbit-you" title={`${session.user.full_name} · şu an aktif`}>{initials}</span>
  </button>;
}

function DesktopHome({ overview, apps, open, orbitEnabled, session, logs }: { overview: Overview; apps: Module[]; open: (code: string) => void; orbitEnabled: boolean; session: Session; logs: SystemLogEntry[] }) {
  const desktopItems = [{ code: "files", name: "Dosyalar" }, ...apps.slice(0, 6).map(module => ({ code: module.code, name: module.name }))];
  const [selected, setSelected] = useState("");
  const [editing, setEditing] = useState(false);
  const [contextMenu, setContextMenu] = useState<Point | null>(null);
  const [widgets, setWidgets] = useState<DesktopWidget[]>(() => {
    try { return JSON.parse(localStorage.getItem("rainwater_desktop_widgets") || "[\"status\",\"agenda\"]"); } catch { return ["status", "agenda"]; }
  });
  const [folders, setFolders] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("rainwater_desktop_folders") || "[]"); } catch { return []; }
  });
  const [droppedFiles, setDroppedFiles] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("rainwater_desktop_files") || "[]"); } catch { return []; }
  });
  const [dropActive, setDropActive] = useState(false);
  const [positions, setPositions] = useState<Record<string, Point>>(() => {
    try { return JSON.parse(localStorage.getItem("rainwater_desktop_positions") || "{}"); } catch { return {}; }
  });
  const drag = useRef<{ id: string; startX: number; startY: number; origin: Point; moved: boolean } | null>(null);
  useEffect(() => { localStorage.setItem("rainwater_desktop_widgets", JSON.stringify(widgets)); }, [widgets]);
  useEffect(() => { localStorage.setItem("rainwater_desktop_folders", JSON.stringify(folders)); }, [folders]);
  useEffect(() => { localStorage.setItem("rainwater_desktop_files", JSON.stringify(droppedFiles)); }, [droppedFiles]);
  useEffect(() => { localStorage.setItem("rainwater_desktop_positions", JSON.stringify(positions)); }, [positions]);
  const allItems = [...desktopItems.map(item => ({ ...item, kind: "app" })), ...folders.map((name, index) => ({ code: `folder-${index}`, name, kind: "folder" })), ...droppedFiles.map((name, index) => ({ code: `file-${index}`, name, kind: "file" }))];
  const fallbackPosition = (index: number): Point => ({ x: 26 + Math.floor(index / 6) * 102, y: 28 + (index % 6) * 94 });
  const beginDrag = (event: ReactPointerEvent<HTMLButtonElement>, id: string, index: number) => {
    if (event.button !== 0) return;
    const origin = positions[id] || fallbackPosition(index);
    drag.current = { id, startX: event.clientX, startY: event.clientY, origin, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelected(id);
  };
  const moveDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const currentDrag = drag.current;
    if (!currentDrag) return;
    const dx = event.clientX - currentDrag.startX;
    const dy = event.clientY - currentDrag.startY;
    if (Math.abs(dx) + Math.abs(dy) > 4) currentDrag.moved = true;
    const { id, origin } = currentDrag;
    setPositions(current => ({ ...current, [id]: { x: Math.max(8, origin.x + dx), y: Math.max(8, origin.y + dy) } }));
  };
  const endDrag = (event: ReactPointerEvent<HTMLButtonElement>) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); drag.current = null; };
  const addWidget = (widget: DesktopWidget) => { setWidgets(current => current.includes(widget) ? current : [...current, widget]); setContextMenu(null); };
  const resetLayout = () => { setPositions({}); setWidgets(["status", "agenda"]); setContextMenu(null); };
  const removeSelected = () => {
    if (selected.startsWith("folder-")) setFolders(current => current.filter((_, index) => `folder-${index}` !== selected));
    if (selected.startsWith("file-")) setDroppedFiles(current => current.filter((_, index) => `file-${index}` !== selected));
    setPositions(current => { const next = { ...current }; delete next[selected]; return next; });
    setSelected(""); setContextMenu(null);
  };
  return <div className={`nx-desktop-home ${editing ? "editing" : ""} ${dropActive ? "drop-active" : ""}`} onClick={() => setContextMenu(null)} onContextMenu={event => { event.preventDefault(); setContextMenu({ x: event.clientX, y: event.clientY }); }} onDragOver={event => { event.preventDefault(); setDropActive(true); }} onDragLeave={() => setDropActive(false)} onDrop={event => { event.preventDefault(); const names = Array.from(event.dataTransfer.files).map(file => file.name); setDroppedFiles(current => [...new Set([...current, ...names])]); setDropActive(false); }}>
    {orbitEnabled && <div className="nx-desktop-orbit"><OrbitPet session={session} logs={logs} open={open} /><p><b>RAINWATER ONE</b><small>{overview.tenant.name} · {overview.users_count} kullanıcı aktif</small></p></div>}
    <div className="nx-desktop-editbar"><button className={editing ? "active" : ""} onClick={event => { event.stopPropagation(); setEditing(value => !value); }}><Move />{editing ? "Düzenlemeyi bitir" : "Masaüstünü düzenle"}</button><button onClick={event => { event.stopPropagation(); setContextMenu({ x: 190, y: 84 }); }}><Plus />Öğe ekle</button></div>
    <div className="nx-desktop-icons">{allItems.map((item, index) => { const position = positions[item.code] || fallbackPosition(index); const isSystemItem = item.kind !== "app"; return <button className={selected === item.code ? "selected" : ""} style={{ left: position.x, top: position.y }} key={item.code} onPointerDown={event => beginDrag(event, item.code, index)} onPointerMove={moveDrag} onPointerUp={endDrag} onDoubleClick={() => isSystemItem ? open("files") : open(item.code)}>{item.kind === "folder" ? <span className="nx-app-glyph large folder"><Folder /></span> : item.kind === "file" ? <span className="nx-app-glyph large desktop-file"><FileText /></span> : <AppGlyph code={item.code} size="large" />}<span>{item.name}</span></button>; })}</div>
    {dropActive && <div className="nx-drop-zone"><Download /><b>Masaüstüne bırak</b><small>Dosya kısayolları bu cihazda saklanır</small></div>}
    {widgets.includes("status") && <section className="nx-welcome-widget nx-desktop-widget"><button className="nx-widget-remove" onClick={() => setWidgets(current => current.filter(item => item !== "status"))}><X /></button><header><span>rw</span><div><small>RAINWATER ONE</small><h1>Çalışma alanı hazır</h1></div><i /></header><p>{overview.tenant.name} uygulamaları tek oturum altında yerel olarak çalışıyor.</p><div><article><Cpu /><span><small>Sistem yükü</small><b>%18</b></span></article><article><HardDrive /><span><small>Veri alanı</small><b>%42</b></span></article><article><ShieldCheck /><span><small>Güvenlik</small><b>{overview.security_score}/100</b></span></article></div><footer><span><i />4 servis çevrimiçi</span><button onClick={() => open("attendance")}>Puantaj MVP'yi aç <ChevronRight /></button></footer></section>}
    {widgets.includes("agenda") && <section className="nx-agenda-widget nx-desktop-widget"><button className="nx-widget-remove" onClick={() => setWidgets(current => current.filter(item => item !== "agenda"))}><X /></button><header><div><small>PAZARTESİ</small><b>13 Temmuz</b></div><CalendarDays /></header><div><time>09:30</time><p><b>Operasyon kontrolü</b><small>Haftalık durum değerlendirmesi</small></p></div><div><time>14:00</time><p><b>Teklif onayları</b><small>7 kayıt bekliyor</small></p></div><footer><span>{overview.users_count}</span> kullanıcı aktif</footer></section>}
    {widgets.includes("notes") && <section className="nx-note-widget nx-desktop-widget"><button className="nx-widget-remove" onClick={() => setWidgets(current => current.filter(item => item !== "notes"))}><X /></button><small>HIZLI NOT</small><textarea defaultValue={"Bugün tamamlanacaklar:\n• Puantaj kontrolü\n• Bekleyen teklif onayları"} /></section>}
    {widgets.includes("storage") && <section className="nx-storage-widget nx-desktop-widget"><button className="nx-widget-remove" onClick={() => setWidgets(current => current.filter(item => item !== "storage"))}><X /></button><header><HardDrive /><p><small>RAIN DISK</small><b>Şirket depolama alanı</b></p></header><div><i /></div><footer><span>42 GB kullanıldı</span><b>100 GB</b></footer><button onClick={() => open("files")}>Dosyaları görüntüle <ChevronRight /></button></section>}
    {contextMenu && <aside className="nx-desktop-menu" style={{ left: Math.min(contextMenu.x, window.innerWidth - 230), top: Math.min(contextMenu.y - 34, window.innerHeight - 390) }} onClick={event => event.stopPropagation()}><small>MASAÜSTÜ</small><button onClick={() => { setFolders(current => [...current, `Yeni Klasör ${current.length + 1}`]); setContextMenu(null); }}><FolderPlus />Yeni klasör</button><button onClick={() => open("files")}><FolderOpen />Dosyaları aç</button><i /><small>WIDGET EKLE</small><button disabled={widgets.includes("notes")} onClick={() => addWidget("notes")}><FileText />Hızlı not</button><button disabled={widgets.includes("storage")} onClick={() => addWidget("storage")}><HardDrive />Depolama</button><button disabled={widgets.includes("status")} onClick={() => addWidget("status")}><Monitor />Sistem durumu</button><button disabled={widgets.includes("agenda")} onClick={() => addWidget("agenda")}><CalendarDays />Ajanda</button><i /><button onClick={() => setEditing(value => !value)}><Move />{editing ? "Düzenlemeyi bitir" : "Simgeleri düzenle"}</button><button disabled={!selected.startsWith("folder-") && !selected.startsWith("file-")} onClick={removeSelected}><Trash2 />Seçili öğeyi kaldır</button><button onClick={resetLayout}><RefreshCw />Yerleşimi sıfırla</button></aside>}
  </div>;
}

export default function LinuxDesktop({ session, overview, catalog, loading, error, onReload, onToggleModule, onSelectPlan, onLaunchModule, onLogout }: Props) {
  const [active, setActive] = useState("home");
  const [opened, setOpened] = useState<string[]>(["home"]);
  const [sidebarExpanded, setSidebarExpanded] = useState(() => localStorage.getItem("rainwater_one_sidebar") === "true" || localStorage.getItem("rainwater_linux_sidebar") === "true");
  const [startOpen, setStartOpen] = useState(false);
  const [notificationCenter, setNotificationCenter] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [launcherQuery, setLauncherQuery] = useState("");
  const [maximized, setMaximized] = useState(false);
  const [now, setNow] = useState(new Date());
  const [handoffs, setHandoffs] = useState<Record<string, ModuleLaunch>>({});
  const [launching, setLaunching] = useState("");
  const [launchErrors, setLaunchErrors] = useState<Record<string, string>>({});
  const [theme, setTheme] = useState<ThemeMode>(() => (localStorage.getItem("rainwater_one_theme") as ThemeMode) || "light");
  const [orbitEnabled, setOrbitEnabled] = useState(() => localStorage.getItem("rainwater_one_orbit") !== "false");
  const [reducedMotion, setReducedMotion] = useState(() => localStorage.getItem("rainwater_one_reduced_motion") === "true");
  const [settingsEntry, setSettingsEntry] = useState<SettingsTab>("general");
  const [systemLogs, setSystemLogs] = useState<SystemLogEntry[]>(readSystemLogs);
  const [windowPosition, setWindowPosition] = useState<Point>({ x: 26, y: 18 });
  const windowDrag = useRef<{ startX: number; startY: number; origin: Point } | null>(null);

  useEffect(() => { localStorage.setItem("rainwater_one_sidebar", String(sidebarExpanded)); }, [sidebarExpanded]);
  useEffect(() => { localStorage.setItem("rainwater_one_theme", theme); }, [theme]);
  useEffect(() => { localStorage.setItem("rainwater_one_orbit", String(orbitEnabled)); }, [orbitEnabled]);
  useEffect(() => { localStorage.setItem("rainwater_one_reduced_motion", String(reducedMotion)); }, [reducedMotion]);
  useEffect(() => { const timer = window.setInterval(() => setNow(new Date()), 30000); return () => window.clearInterval(timer); }, []);
  useEffect(() => {
    const onSystemLog = (event: Event) => setSystemLogs(current => [(event as CustomEvent<SystemLogEntry>).detail, ...current].slice(0, 250));
    const onWindowError = (event: ErrorEvent) => recordSystemLog("error", "portal.window", event.message || "Bilinmeyen pencere hatası", event.error?.stack || `${event.filename || ""}:${event.lineno || 0}:${event.colno || 0}`);
    const onUnhandled = (event: PromiseRejectionEvent) => { const reason = event.reason; recordSystemLog("error", "portal.promise", reason instanceof Error ? reason.message : String(reason || "Yakalanmayan işlem hatası"), reason instanceof Error ? reason.stack || "" : ""); };
    const originalConsoleError = console.error;
    const originalConsoleWarn = console.warn;
    console.error = (...args: unknown[]) => { originalConsoleError(...args); recordSystemLog("error", "browser.console", args.map(item => item instanceof Error ? item.message : String(item)).join(" "), args.find(item => item instanceof Error) instanceof Error ? (args.find(item => item instanceof Error) as Error).stack || "" : ""); };
    console.warn = (...args: unknown[]) => { originalConsoleWarn(...args); recordSystemLog("warning", "browser.console", args.map(item => item instanceof Error ? item.message : String(item)).join(" ")); };
    window.addEventListener(SYSTEM_LOG_EVENT, onSystemLog);
    window.addEventListener("error", onWindowError);
    window.addEventListener("unhandledrejection", onUnhandled);
    if (!readSystemLogs().length) recordSystemLog("info", "rainwater.system", "Sistem günlüğü başlatıldı", "Portal hataları, modül bağlantıları ve beklenmeyen işlemler bu cihazda kaydedilecek.");
    return () => { console.error = originalConsoleError; console.warn = originalConsoleWarn; window.removeEventListener(SYSTEM_LOG_EVENT, onSystemLog); window.removeEventListener("error", onWindowError); window.removeEventListener("unhandledrejection", onUnhandled); };
  }, []);
  useEffect(() => {
    const closeOverlays = () => { setStartOpen(false); setNotificationCenter(false); };
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); closeOverlays(); setCommandOpen(value => !value); }
      if (event.key === "F1") { event.preventDefault(); setNotificationCenter(false); setStartOpen(value => !value); }
      if (event.key === "Escape") { setStartOpen(false); setNotificationCenter(false); setCommandOpen(false); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  if (loading && !overview) return <div className="nx-boot"><Logo size="large" /><i /><b>Rainwater One</b><small>çalışma sistemi başlatılıyor</small></div>;
  if (!overview) return <div className="nx-boot error"><ShieldCheck /><b>Oturum başlatılamadı</b><small>{error}</small><button onClick={() => void onReload()}>Tekrar dene</button></div>;

  const modules = overview.modules.filter(item => item.code !== "platform");
  const enabled = modules.filter(item => item.enabled);
  const byCode = Object.fromEntries(modules.map(item => [item.code, item]));
  const visibleApps = modules.filter(item => `${item.name} ${item.description}`.toLocaleLowerCase("tr").includes(launcherQuery.toLocaleLowerCase("tr")));
  const activeModule = byCode[active];
  const ActiveIcon = active === "home" ? LayoutDashboard : APP_ICONS[active] || AppWindow;
  const activeName = active === "files" ? "Dosyalar" : active === "settings" ? "Ayarlar" : active === "logs" ? "Sistem Günlüğü" : activeModule?.name || "Masaüstü";

  const closePanels = () => { setStartOpen(false); setNotificationCenter(false); setCommandOpen(false); };
  const launch = async (module: Module) => {
    setLaunching(module.code);
    setLaunchErrors(current => ({ ...current, [module.code]: "" }));
    setHandoffs(current => { const next = { ...current }; delete next[module.code]; return next; });
    try { const handoff = await onLaunchModule(module); setHandoffs(current => ({ ...current, [module.code]: handoff })); recordSystemLog("info", `module.${module.code}`, `${module.name} güvenli oturumla başlatıldı`); }
    catch (launchError) { const message = launchError instanceof Error ? launchError.message : "Uygulama servisine bağlanılamadı"; setLaunchErrors(current => ({ ...current, [module.code]: message })); recordSystemLog("error", `module.${module.code}`, `${module.name} başlatılamadı`, launchError instanceof Error ? launchError.stack || "" : ""); }
    finally { setLaunching(""); }
  };
  const open = (code: string) => {
    closePanels();
    if (code === "home") { setMaximized(false); setActive("home"); return; }
    if (code === "files" || code === "settings" || code === "logs") { setOpened(current => current.includes(code) ? current : [...current, code]); setActive(code); return; }
    const module = byCode[code];
    if (!module?.enabled) return;
    setOpened(current => current.includes(code) ? current : [...current, code]);
    setActive(code);
    if (REAL_APPS.has(code)) void launch(module);
  };
  const close = (code: string) => { const next = opened.filter(item => item !== code); setMaximized(false); setOpened(next); setActive(next[next.length - 1] || "home"); };
  const minimize = () => { setMaximized(false); setActive("home"); };
  const clearSystemLogs = () => { localStorage.removeItem(SYSTEM_LOG_KEY); setSystemLogs([]); };
  const refreshActive = () => { if (active === "files" || active === "settings" || active === "logs") return; if (activeModule && REAL_APPS.has(active)) void launch(activeModule); else void onReload(); };
  const toggleNotifications = () => { setNotificationCenter(value => !value); setStartOpen(false); };
  const beginWindowDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (maximized || event.button !== 0 || (event.target instanceof Element && event.target.closest("button"))) return;
    windowDrag.current = { startX: event.clientX, startY: event.clientY, origin: windowPosition };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveWindow = (event: ReactPointerEvent<HTMLElement>) => {
    if (!windowDrag.current) return;
    const stage = event.currentTarget.closest(".nx-stage")?.getBoundingClientRect();
    const nextX = windowDrag.current.origin.x + event.clientX - windowDrag.current.startX;
    const nextY = windowDrag.current.origin.y + event.clientY - windowDrag.current.startY;
    setWindowPosition({ x: Math.max(0, Math.min(nextX, Math.max(0, (stage?.width || 900) - 360))), y: Math.max(0, Math.min(nextY, Math.max(0, (stage?.height || 650) - 120))) });
  };
  const endWindowDrag = (event: ReactPointerEvent<HTMLElement>) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); windowDrag.current = null; };

  return <main className={`nx-shell theme-${theme} ${sidebarExpanded ? "sidebar-expanded" : ""} ${maximized ? "window-maximized" : ""} ${reducedMotion ? "reduce-motion" : ""}`}>
    <header className="nx-topbar">
      <button className="nx-rainwater-button" onClick={() => open("home")}><Logo size="tiny" /><span>Rainwater One</span></button>
      <button className="nx-clock" onClick={toggleNotifications}><b>{new Intl.DateTimeFormat("tr-TR", { weekday: "short", day: "numeric", month: "short" }).format(now)}</b><span>{new Intl.DateTimeFormat("tr-TR", { hour: "2-digit", minute: "2-digit" }).format(now)}</span></button>
      <div className="nx-system-indicators"><button title="Bildirimler" onClick={toggleNotifications}><Bell /><i>3</i></button></div>
    </header>

    <section className="nx-body">
      <aside className="nx-dock">
        <div className="nx-dock-brand"><Logo size="small" /><b>Rainwater<small>One çalışma sistemi</small></b></div>
        <button className={active === "home" ? "active" : ""} onClick={() => open("home")} title="Masaüstü"><AppGlyph code="platform" /><span>Masaüstü</span></button>
        <button className={active === "files" ? "active" : ""} onClick={() => open("files")} title="Dosyalar"><AppGlyph code="files" /><span>Dosyalar</span>{opened.includes("files") && <em />}</button>
        <i />
        {enabled.map(module => <button className={active === module.code ? "active" : ""} onClick={() => open(module.code)} title={module.name} key={module.code}><AppGlyph code={module.code} /><span>{module.name}</span>{opened.includes(module.code) && <em />}</button>)}
        <div className="nx-dock-spacer" />
        <button className={active === "logs" ? "active" : ""} onClick={() => open("logs")} title="Sistem Günlüğü"><AppGlyph code="logs" /><span>Sistem Günlüğü</span>{opened.includes("logs") && <em />}</button>
        <button className={active === "settings" ? "active" : ""} onClick={() => { setSettingsEntry("general"); open("settings"); }} title="Ayarlar"><AppGlyph code="settings" /><span>Ayarlar</span>{opened.includes("settings") && <em />}</button>
        <button onClick={() => { setStartOpen(true); setLauncherQuery(""); }} title="Başlat"><span className="nx-app-glyph normal"><Grid2X2 /></span><span>Başlat</span></button>
        <button onClick={() => setSidebarExpanded(value => !value)} title={sidebarExpanded ? "Paneli daralt" : "Paneli genişlet"}>{sidebarExpanded ? <PanelLeftClose /> : <PanelLeftOpen />}<span>{sidebarExpanded ? "Paneli daralt" : "Paneli genişlet"}</span></button>
      </aside>

      <section className="nx-stage">
        {active === "home" && <DesktopErrorBoundary><DesktopHome overview={overview} apps={enabled} open={open} orbitEnabled={orbitEnabled} session={session} logs={systemLogs} /></DesktopErrorBoundary>}
        {active !== "home" && (activeModule || active === "files" || active === "settings" || active === "logs") && <article className="nx-window nx-window-floating" style={maximized ? undefined : { left: windowPosition.x, top: windowPosition.y }}>
          <header className="nx-titlebar" onPointerDown={beginWindowDrag} onPointerMove={moveWindow} onPointerUp={endWindowDrag}><div className="nx-window-controls"><button onClick={minimize} title="Küçült"><Minimize2 /></button><button onClick={() => setMaximized(value => !value)} title={maximized ? "Geri yükle" : "Büyüt"}><Maximize2 /></button><button className="close" onClick={() => close(active)} title="Kapat"><X /></button></div><p><ActiveIcon /><b>{activeName}</b><span>Rainwater One · yerel çalışma sistemi</span></p><div><button onClick={() => setCommandOpen(true)} title="Komut ara"><Command /></button><button onClick={refreshActive} title="Yenile"><RefreshCw /></button><button onClick={() => setMaximized(value => !value)} title={maximized ? "Geri yükle" : "Tam ekran"}><Maximize2 /></button></div></header>
          <section className="nx-window-content">{active === "files" ? <FileExplorer /> : active === "settings" ? <SettingsApplication overview={overview} session={session} catalog={catalog} theme={theme} setTheme={setTheme} orbitEnabled={orbitEnabled} setOrbitEnabled={setOrbitEnabled} reducedMotion={reducedMotion} setReducedMotion={setReducedMotion} initialTab={settingsEntry} onToggleModule={onToggleModule} onSelectPlan={onSelectPlan} onLogout={onLogout} /> : active === "logs" ? <SystemLogApplication logs={systemLogs} onClear={clearSystemLogs} /> : activeModule && (REAL_APPS.has(active) ? <EmbeddedApplication module={activeModule} handoff={handoffs[active]} busy={launching === active} error={launchErrors[active]} retry={() => void launch(activeModule)} /> : <NativeApplication module={activeModule} />)}</section>
        </article>}
      </section>
    </section>


    {startOpen && <div className="nx-start-layer" onMouseDown={() => setStartOpen(false)}><aside className="nx-start-menu" onMouseDown={event => event.stopPropagation()}><header><Logo size="small" /><div><small>RAINWATER ONE</small><b>Merhaba, {session.user.full_name.split(" ")[0]}</b></div><button onClick={() => setStartOpen(false)}><X /></button></header><label><Search /><input autoFocus value={launcherQuery} onChange={event => setLauncherQuery(event.target.value)} placeholder="Uygulama, dosya veya işlem ara" /><kbd>Ctrl K</kbd></label><section className="nx-start-pinned"><header><div><small>SABİTLENENLER</small><b>Hızlı erişim</b></div><button onClick={() => { setSettingsEntry("general"); open("settings"); }}>Tüm ayarlar <ChevronRight /></button></header><div><button onClick={() => open("files")}><AppGlyph code="files" size="large" /><span><b>Dosyalar</b><small>Şirket alanı</small></span></button><button onClick={() => { setSettingsEntry("general"); open("settings"); }}><AppGlyph code="settings" size="large" /><span><b>Ayarlar</b><small>Sistem yönetimi</small></span></button><button onClick={() => open("logs")}><AppGlyph code="logs" size="large" /><span><b>Sistem Günlüğü</b><small>{systemLogs.filter(item => item.level === "error").length} hata kaydı</small></span></button>{visibleApps.filter(item => item.enabled).slice(0, 5).map(module => <button onClick={() => open(module.code)} key={module.code}><AppGlyph code={module.code} size="large" /><span><b>{module.name}</b><small>{opened.includes(module.code) ? "Çalışıyor" : module.category}</small></span></button>)}</div></section><section className="nx-start-intelligence"><header><small>BUGÜN</small><b>İş akışı</b></header><div><button onClick={() => open("offers")}><FileCheck2 /><span><b>7 teklif onay bekliyor</b><small>Rain Teklif · öncelikli</small></span><ChevronRight /></button><button onClick={() => open("attendance")}><Activity /><span><b>4 izin talebi güncellendi</b><small>Puantaj MVP · bugün</small></span><ChevronRight /></button><button onClick={() => { setSettingsEntry("subscription"); open("settings"); }}><CreditCard /><span><b>{overview.plan?.name || "Abonelik"}</b><small>{money(overview.monthly_total)} / ay · yönet</small></span><ChevronRight /></button></div></section><footer><div><span>{session.user.full_name.slice(0, 2).toLocaleUpperCase("tr")}</span><p><b>{session.user.full_name}</b><small>{overview.tenant.name}</small></p></div><a href="/third-party-notices.txt" target="_blank" rel="noreferrer" title="Görsel lisansları"><FileText /></a><button onClick={onLogout} title="Oturumu kapat"><Power /></button></footer></aside></div>}

    {notificationCenter && <aside className="nx-popover nx-notifications"><header><div><small>{new Intl.DateTimeFormat("tr-TR", { weekday: "long" }).format(now)}</small><b>{new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", year: "numeric" }).format(now)}</b></div><button onClick={() => setNotificationCenter(false)}><X /></button></header><div className="nx-calendar"><div>{["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"].map(day => <b key={day}>{day}</b>)}</div><section>{Array.from({ length: 35 }, (_, index) => index < 2 ? <i key={index} /> : <button className={index === 14 ? "today" : ""} key={index}>{index - 1}</button>)}</section></div><div className="nx-notification-list"><header><b>Bildirimler</b><button>Tümünü temizle</button></header><button onClick={() => open("offers")}><AppGlyph code="offers" /><p><b>7 teklif onay bekliyor</b><small>Rain Teklif · 5 dakika önce</small></p></button><button onClick={() => open("attendance")}><AppGlyph code="attendance" /><p><b>4 izin talebi güncellendi</b><small>Puantaj MVP · 18 dakika önce</small></p></button><button onClick={() => open("warehouse")}><AppGlyph code="warehouse" /><p><b>12 ürün kritik stokta</b><small>Depo ve Stok · 32 dakika önce</small></p></button></div></aside>}

    {commandOpen && <div className="nx-overlay nx-command" onMouseDown={() => setCommandOpen(false)}><section onMouseDown={event => event.stopPropagation()}><header><Command /><input autoFocus value={launcherQuery} onChange={event => setLauncherQuery(event.target.value)} placeholder="Uygulama, ayar veya komut ara…" /><kbd>ESC</kbd></header><small>SİSTEM</small><button onClick={() => open("files")}><AppGlyph code="files" /><p><b>Dosyalar</b><small>Dosya gezgini</small></p><span>Aç <ChevronRight /></span></button><button onClick={() => { setSettingsEntry("general"); open("settings"); }}><AppGlyph code="settings" /><p><b>Ayarlar</b><small>Abonelik, görünüm ve hesap</small></p><span>Aç <ChevronRight /></span></button><button onClick={() => open("logs")}><AppGlyph code="logs" /><p><b>Sistem Günlüğü</b><small>Kalıcı hata ve uyarı kayıtları</small></p><span>Aç <ChevronRight /></span></button><small>UYGULAMALAR</small>{visibleApps.filter(item => item.enabled).map(module => <button onClick={() => open(module.code)} key={module.code}><AppGlyph code={module.code} /><p><b>{module.name}</b><small>{module.category}</small></p><span>Aç <ChevronRight /></span></button>)}<footer><span>↑ ↓ gezin</span><span>Enter aç</span><span>Esc kapat</span></footer></section></div>}
  </main>;
}
