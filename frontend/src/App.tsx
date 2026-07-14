import { FormEvent, useEffect, useRef, useState } from "react";
import { Building2, Check, ChevronRight, LockKeyhole, ShieldCheck, Users } from "lucide-react";
import LinuxDesktop from "./LinuxDesktop";

type Tenant = { id: string; slug: string; name: string; status: string };
type User = { id: string; email: string; full_name: string; role: string; permissions: string[]; platform_admin: boolean };
type Module = { code: string; name: string; description: string; category: string; monthly_price: string; currency: string; core: boolean; enabled: boolean; source: string };
type Plan = { code: string; name: string; description: string; monthly_base_price: string; currency: string; included_users: number; modules: string[] };
type Overview = { tenant: Tenant; plan: Plan | null; modules: Module[]; monthly_total: string; users_count: number; verified_domains: number; security_score: number };
type Session = { access_token: string; expires_in: number; tenant: Tenant; user: User };
type ModuleLaunch = { launch_url: string; ticket: string; expires_in: number; module_code: string };

const API = import.meta.env.VITE_API_URL || "";

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.name = "ApiError"; this.status = status; }
}

function isTokenExpired(token: string): boolean {
  try {
    const encoded = token.split(".")[1];
    if (!encoded) return true;
    const normalized = encoded.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(encoded.length / 4) * 4, "=");
    const payload = JSON.parse(atob(normalized));
    return typeof payload.exp !== "number" || payload.exp * 1000 <= Date.now() + 5000;
  } catch { return true; }
}

function storedSession(): Session | null {
  try {
    const value = JSON.parse(sessionStorage.getItem("rainwater_session") || "null") as Session | null;
    if (!value || isTokenExpired(value.access_token)) { sessionStorage.removeItem("rainwater_session"); return null; }
    return value;
  } catch { sessionStorage.removeItem("rainwater_session"); return null; }
}

async function request<T>(path: string, token?: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options?.headers },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = body.detail;
    const message = typeof detail === "string"
      ? detail
      : Array.isArray(detail)
        ? detail.map(item => item?.msg).filter(Boolean).join(" · ")
        : typeof body.message === "string"
          ? body.message
          : "İşlem tamamlanamadı";
    throw new ApiError(message || "İşlem tamamlanamadı", response.status);
  }
  return body;
}

function Login({ onLogin }: { onLogin: (session: Session) => void }) {
  const [tenant, setTenant] = useState(() => localStorage.getItem("rainwater_login_tenant") || "");
  const [email, setEmail] = useState(() => localStorage.getItem("rainwater_login_email") || "");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const session = await request<Session>("/api/v1/auth/login", undefined, { method: "POST", body: JSON.stringify({ tenant_slug: tenant, email, password }) });
      sessionStorage.setItem("rainwater_session", JSON.stringify(session));
      if (remember) {
        localStorage.setItem("rainwater_login_tenant", tenant);
        localStorage.setItem("rainwater_login_email", email);
      } else {
        localStorage.removeItem("rainwater_login_tenant");
        localStorage.removeItem("rainwater_login_email");
      }
      onLogin(session);
    } catch (err) { setError(err instanceof Error ? err.message : "Giriş yapılamadı"); }
    finally { setBusy(false); }
  };
  return <main className="login-page">
    <section className="login-story">
      <div className="story-brand"><span className="rain-logo">RW</span><div><strong>RAINWATER</strong><small>ŞİRKET PLATFORMU</small></div></div>
      <div className="story-copy"><span className="story-kicker">RAINWATER ANA PORTAL</span><h1>Şirket yönetimi için ortak çalışma alanı.</h1><p>İnsan kaynakları, puantaj, depo ve diğer operasyon modüllerini aynı hesap ve yetki yapısı altında yönetin.</p><ul className="login-capabilities"><li><Check/>Şirket bazlı yetki ve erişim</li><li><Check/>Kendi alan adı ve sunucu desteği</li><li><Check/>İhtiyaca göre açılan modüller</li></ul></div>
      <div className="trust-row"><span>Rainwater kurumsal sistemleri</span><span>YABUJIN</span></div>
    </section>
    <section className="login-side"><form className="login-card" onSubmit={submit}>
      <div className="mobile-brand"><span className="rain-logo">RW</span><strong>Rainwater</strong></div>
      <p className="overline">YÖNETİM KONSOLU</p><h2>Portalınıza giriş yapın</h2><p className="form-lead">Şirket kodunuz ve yönetici hesabınızla devam edin.</p>
      {error && <div className="form-error">{error}</div>}
      <label>Şirket kodu<div className="input-wrap"><Building2/><input required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value={tenant} onChange={e => setTenant(e.target.value.toLowerCase())} placeholder="ornek-sirket" /></div></label>
      <label>E-posta adresi<div className="input-wrap"><Users/><input required type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="yonetici@sirket.com" /></div></label>
      <label>Parola<div className="input-wrap"><LockKeyhole/><input required minLength={8} type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••••••" /></div></label>
      <button className="primary-button login-button" disabled={busy}>{busy ? "Güvenli oturum açılıyor…" : "Portala giriş yap"}<ChevronRight/></button>
      <p className="login-note"><ShieldCheck/>Oturumunuz kısa ömürlü erişim anahtarıyla korunur.</p>
    </form><p className="signature">YABUJIN · RAINWATER PORTAL</p></section>
  </main>;
}

export default function App() {
  const [session, setSession] = useState<Session | null>(storedSession);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [catalog, setCatalog] = useState<Plan[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const loadInFlight = useRef("");
  const load = async () => {
    if (!session || loadInFlight.current === session.access_token) return;
    const token = session.access_token;
    if (isTokenExpired(token)) {
      sessionStorage.removeItem("rainwater_session");
      setOverview(null); setSession(null);
      return;
    }
    loadInFlight.current = token;
    setLoading(true); setError("");
    try {
      const info = await request<Overview>("/api/v1/platform/overview", token);
      const publicCatalog = await request<{ plans: Plan[] }>("/api/v1/platform/catalog");
      setOverview(info); setCatalog(publicCatalog.plans);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Portal yüklenemedi";
      setError(message);
      if (err instanceof ApiError && err.status === 401) {
        sessionStorage.removeItem("rainwater_session");
        setOverview(null); setSession(null);
      }
    } finally {
      if (loadInFlight.current === token) loadInFlight.current = "";
      setLoading(false);
    }
  };
  useEffect(() => { void load(); }, [session]);
  if (!session) return <Login onLogin={setSession}/>;
  const logout = () => { sessionStorage.removeItem("rainwater_session"); setSession(null); setOverview(null); };
  const toggleModule = async (module: Module) => {
    await request(`/api/v1/platform/modules/${module.code}`, session.access_token, {
      method: "PATCH",
      body: JSON.stringify({ enabled: !module.enabled }),
    });
    await load();
  };
  const selectPlan = async (code: string) => {
    await request("/api/v1/platform/subscription", session.access_token, {
      method: "PATCH",
      body: JSON.stringify({ plan_code: code }),
    });
    await load();
  };
  const launchModule = (module: Module) => request<ModuleLaunch>(
    `/api/v1/platform/modules/${module.code}/launch`,
    session.access_token,
    { method: "POST" },
  );
  return <LinuxDesktop session={session} overview={overview} catalog={catalog} loading={loading} error={error} onReload={load} onToggleModule={toggleModule} onSelectPlan={selectPlan} onLaunchModule={launchModule} onLogout={logout}/>;
}
