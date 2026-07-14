const BASE = import.meta.env.VITE_API_BASE ?? "";

export type User = { id: number; ad: string; rol: string; aktif: boolean };
export type Oturum = {
  id: number; ad: string; lokasyon: string | null;
  durum: string; mod: string; baslangic: string; bitis: string | null;
  depo_id?: number | null; depo_ad?: string | null;
};
export type StokOzet = {
  id: number; stok_kodu: string; urun_adi: string;
  toplam: number; sayilan: number; portal_sayim: number;
  sonradan_eklendi?: boolean;
  depo_miktar?: number | null;
};
export type Depo = {
  id: number; ad: string; lokasyon: string | null;
  aktif: boolean; olusturma: string;
};
export type DepoStokRow = {
  id: number; stok_kodu: string; urun_adi: string;
  miktar: number; guncelleme: string;
};
export type DepoDetay = Depo & { stoklar: DepoStokRow[] };
export type CakisanSecenek = {
  seri_id: number; stok_id: number; stok_kodu: string; urun_adi: string;
  sayildi: boolean; eslesme_tipi: string;
  barkod_stokuyla_uyumlu_mu?: boolean | null;
};
export type Tarama = {
  durum: "basarili" | "mukerrer" | "bulunamadi" | "cakisma" | "bos";
  mesaj: string; seri: string;
  stok_kodu?: string | null; urun_adi?: string | null;
  toplam?: number | null; sayilan?: number | null; kalan?: number | null;
  portal_sayim?: number | null; portal_fark?: number | null;
  cakisan_stoklar?: string[] | null;
  cakisan_secenekler?: CakisanSecenek[] | null;
  raw_seri?: string | null; raw_input?: string | null;
  normalized_input?: string | null; resolved_serial?: string | null;
  parsed_stock_code?: string | null;
  client_scan_id?: string | null; idempotent_replay?: boolean;
};
export type LogSatir = {
  id: number; zaman: string; seri_giris: string; durum: string;
  stok_kodu: string | null; urun_adi: string | null; aciklama: string | null;
  kullanici_ad: string | null;
};
export type Ozet = {
  toplam_seri: number; sayilan_seri: number; kalan_seri: number;
  stok_sayisi: number; portal_toplam: number; portal_fark: number;
  son_islem: string | null;
};
export type LogSayfa = { toplam: number; items: LogSatir[] };
export type DurumSayim = { durum: string; sayi: number };
export type KullaniciIstatistik = {
  kullanici_id: number | null; ad: string;
  basarili: number; mukerrer: number; bulunamadi: number; cakisma: number;
  toplam_tarama: number; son_tarama: string | null;
};
export type DakikaSayim = { zaman: string; basarili: number; diger: number };
export type Istatistik = {
  durum_dagilimi: DurumSayim[];
  kullanici_basina: KullaniciIstatistik[];
  dakika_serisi: DakikaSayim[];
  ilk_tarama: string | null; son_tarama: string | null;
  tarama_dakika_dk: number;
};
export type EksikGrup = {
  stok_id: number; stok_kodu: string; urun_adi: string;
  toplam: number; sayilan: number; eksik: number;
  portal_sayim: number; seriler: string[];
};
export type LogFiltre = {
  durum?: string; kullanici_id?: number; q?: string;
  baslangic?: string; bitis?: string;
  limit?: number; offset?: number;
};
export type AuditSatir = {
  id: number; zaman: string;
  kullanici_ad: string | null;
  eylem: string; kaynak_tip: string | null; kaynak_id: string | null;
  ip: string | null; detay: Record<string, any> | null;
};
export type ZimmetSenediCalisan = {
  depo_user_id: number | null; employee_id: number | null; ad: string; urun_sayisi: number;
};
export type ZimmetSenediBugun = { tarih: string; calisanlar: ZimmetSenediCalisan[] };
export type ZimmetCalisan = {
  id: number; ad: string; departman: string | null; zimmet_sayisi: number;
};
export type ZimmetUrun = {
  seri_id: number; seri_no: string; stok_kodu: string; urun_adi: string;
  depo_id: number | null; depo_ad: string | null;
  zimmet_employee_id: number | null; zimmet_employee_ad: string | null;
  zimmet_zaman: string | null; zimmet_notu: string | null;
};
export type ZimmetHareket = {
  id: number; islem: "zimmet" | "iade" | "devir"; zaman: string;
  seri_id: number; seri_no: string; stok_kodu: string; urun_adi: string;
  yapan: string | null; notu: string | null;
};
export type ZimmetCalisanDetay = {
  calisan: { id: number; ad: string };
  zimmetler: ZimmetUrun[];
  hareketler: ZimmetHareket[];
};

const TOKEN_KEY = "rw_token";
const REFRESH_KEY = "rw_refresh";

function yeniTaramaId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function tokens() {
  return {
    access: localStorage.getItem(TOKEN_KEY),
    refresh: localStorage.getItem(REFRESH_KEY),
  };
}

export function setTokens(access: string | null, refresh: string | null = null) {
  if (access) localStorage.setItem(TOKEN_KEY, access);
  else localStorage.removeItem(TOKEN_KEY);
  if (refresh) localStorage.setItem(REFRESH_KEY, refresh);
  else if (refresh === null && !access) localStorage.removeItem(REFRESH_KEY);
}

let refreshing: Promise<string | null> | null = null;
let onUnauth: () => void = () => {};
export function setOnUnauth(fn: () => void) { onUnauth = fn; }

async function tryRefresh(): Promise<string | null> {
  if (refreshing) return refreshing;
  const r = tokens().refresh;
  if (!r) return null;
  refreshing = (async () => {
    try {
      const resp = await fetch(BASE + "/api/depo/auth/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: r }),
      });
      if (!resp.ok) return null;
      const j = await resp.json();
      setTokens(j.access_token, j.refresh_token);
      return j.access_token as string;
    } catch { return null; }
    finally { refreshing = null; }
  })();
  return refreshing;
}

async function req<T>(path: string, opts: RequestInit = {}, retry = true): Promise<T> {
  const headers: Record<string, string> = { ...(opts.headers as any) };
  if (!(opts.body instanceof FormData) && opts.body) headers["Content-Type"] = "application/json";
  const t = tokens().access;
  if (t) headers["Authorization"] = `Bearer ${t}`;
  const r = await fetch(BASE + path, { ...opts, headers });
  if (r.status === 401 && retry) {
    const yeni = await tryRefresh();
    if (yeni) {
      return req<T>(path, opts, false);
    }
    setTokens(null, null);
    onUnauth();
    throw new Error("Yetki gerekli, tekrar giris yap");
  }
  if (!r.ok) {
    let msg = `HTTP ${r.status}`;
    try { const j = await r.json(); msg = j.detail ?? msg; } catch { /* ignore */ }
    throw new Error(msg);
  }
  if (r.status === 204) return undefined as T;
  const ct = r.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) return r.json() as Promise<T>;
  return undefined as T;
}

export const api = {
  login: (ad: string, pin: string) =>
    req<{ access_token: string; refresh_token: string; user_id: number; ad: string; rol: string }>(
      "/api/depo/auth/login", { method: "POST", body: JSON.stringify({ ad, pin }) }, false
    ),
  me: () => req<User>("/api/depo/auth/me"),
  kendiPinim: (eski_pin: string, yeni_pin: string) =>
    req<{ ok: boolean }>("/api/depo/auth/me/pin", { method: "POST", body: JSON.stringify({ eski_pin, yeni_pin }) }),
  users: () => req<User[]>("/api/depo/auth/users"),
  createUser: (ad: string, pin: string, rol: string) =>
    req<User>("/api/depo/auth/users", { method: "POST", body: JSON.stringify({ ad, pin, rol }) }),
  updateUser: (id: number, data: Partial<Pick<User, "ad" | "rol" | "aktif">>) =>
    req<User>(`/api/depo/auth/users/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  pinReset: (id: number, yeni_pin: string) =>
    req<{ ok: boolean }>(`/api/depo/auth/users/${id}/pin-reset`, { method: "POST", body: JSON.stringify({ yeni_pin }) }),
  silUser: (id: number) =>
    req<{ ok: boolean }>(`/api/depo/auth/users/${id}`, { method: "DELETE" }),

  oturumlar: (arsiv = false) => req<Oturum[]>(`/api/depo/sayim?arsiv=${arsiv}`),
  yeniOturum: (ad: string, lokasyon: string, mod: "seri" | "serbest" = "seri", depo_id?: number) =>
    req<Oturum>("/api/depo/sayim", { method: "POST", body: JSON.stringify({ ad, lokasyon, mod, depo_id }) }),
  oturum: (id: number) => req<Oturum>(`/api/depo/sayim/${id}`),
  oturumOzet: (id: number) => req<Ozet>(`/api/depo/sayim/${id}/ozet`),
  oturumStoklar: (id: number) => req<StokOzet[]>(`/api/depo/sayim/${id}/stoklar`),
  oturumLog: (id: number, limit = 50) => req<LogSatir[]>(`/api/depo/sayim/${id}/log?limit=${limit}`),
  oturumBitir: (id: number, pin: string) =>
    req<Oturum>(`/api/depo/sayim/${id}/bitir`, { method: "POST", body: JSON.stringify({ pin }) }),
  oturumArsivle: (id: number) => req<Oturum>(`/api/depo/sayim/${id}/arsivle`, { method: "POST" }),
  oturumSil: (id: number) => req<{ ok: boolean }>(`/api/depo/sayim/${id}`, { method: "DELETE" }),

  tara: (
    oturum_id: number,
    seri: string,
    secim?: { secilen_seri_id: number; secilen_stok_id: number },
    client_scan_id = yeniTaramaId(),
  ) =>
    req<Tarama>("/api/depo/tarama", {
      method: "POST",
      body: JSON.stringify({ oturum_id, seri, client_scan_id, ...secim }),
    }),

  excelYukle: (oturum_id: number, file: File, devam = false) => {
    const fd = new FormData();
    fd.append("file", file);
    return req<{
      sayfa: string; eklenen_stok: number; eklenen_seri: number;
      mukerrer_seri: number; atlanan_junk_header: number; bos_satir: number;
      devam_modu: boolean; onceden_sayilan_olarak_isaretlenen: number;
      supheli_onceki_sayim: number;
      cakismali_seri: number; hatali_satir: number;
    }>(`/api/depo/import/${oturum_id}/stok-excel?devam=${devam}`, { method: "POST", body: fd });
  },

  excelIndir: (oturum_id: number) => {
    const t = tokens().access;
    return fetch(BASE + `/api/depo/export/${oturum_id}/excel`, {
      headers: t ? { Authorization: `Bearer ${t}` } : {}
    }).then(r => r.blob());
  },

  logFiltre: (oturum_id: number, f: LogFiltre = {}) => {
    const p = new URLSearchParams();
    if (f.durum) p.set("durum", f.durum);
    if (f.kullanici_id != null) p.set("kullanici_id", String(f.kullanici_id));
    if (f.q) p.set("q", f.q);
    if (f.baslangic) p.set("baslangic", f.baslangic);
    if (f.bitis) p.set("bitis", f.bitis);
    p.set("limit", String(f.limit ?? 100));
    p.set("offset", String(f.offset ?? 0));
    return req<LogSayfa>(`/api/depo/sayim/${oturum_id}/log-filtre?${p.toString()}`);
  },
  istatistik: (oturum_id: number) => req<Istatistik>(`/api/depo/sayim/${oturum_id}/istatistik`),
  eksik: (oturum_id: number) => req<EksikGrup[]>(`/api/depo/sayim/${oturum_id}/eksik?limit_seri=50`),
  logExcel: (oturum_id: number) => {
    const t = tokens().access;
    return fetch(BASE + `/api/depo/sayim/${oturum_id}/log/excel`, {
      headers: t ? { Authorization: `Bearer ${t}` } : {}
    }).then(r => r.blob());
  },

  depolar: () => req<Depo[]>("/api/depo/depo"),
  yeniDepo: (ad: string, lokasyon?: string) =>
    req<Depo>("/api/depo/depo", { method: "POST", body: JSON.stringify({ ad, lokasyon }) }),
  depoDetay: (id: number) => req<DepoDetay>(`/api/depo/depo/${id}`),

  stokEkle: (oturum_id: number, stok_kodu: string, urun_adi: string, portal_sayim = 0) =>
    req<{ id: number; stok_kodu: string; urun_adi: string; portal_sayim: number; sonradan_eklendi: boolean }>(
      `/api/depo/sayim/${oturum_id}/stok`,
      { method: "POST", body: JSON.stringify({ stok_kodu, urun_adi, portal_sayim }) }
    ),
  seriEkle: (
    stok_id: number,
    seri_no: string,
    sayildi_olarak_ekle = false,
    cakisma_onaylandi = false,
    supheli_barkod_onaylandi = false,
  ) =>
    req<any>(`/api/depo/stok/${stok_id}/seri`,
      {
        method: "POST",
        body: JSON.stringify({ seri_no, sayildi_olarak_ekle, cakisma_onaylandi, supheli_barkod_onaylandi }),
      }),
  stokSeriler: (stok_id: number) => req<any[]>(`/api/depo/stok/${stok_id}/seriler`),
  seriYenidenAdlandir: (seri_id: number, seri_no: string) =>
    req<any>(`/api/depo/seri/${seri_id}`, { method: "PATCH", body: JSON.stringify({ seri_no }) }),

  serisizGiris: (oturum_id: number, satirlar: { stok_kodu: string; adet: number; urun_adi?: string }[]) =>
    req<{ yeni_stok: number; yeni_seri: number; kodlar: string[] }>(
      `/api/depo/sayim/${oturum_id}/serisiz-giris`,
      { method: "POST", body: JSON.stringify({ satirlar }) }
    ),
  seriSil: (seri_id: number) =>
    req<{ silindi: boolean; kalan: number }>(`/api/depo/seri/${seri_id}`, { method: "DELETE" }),

  topluGiris: (oturum_id: number, satirlar: { stok_kodu: string; urun_adi?: string; seri_no: string; portal_sayim?: number }[]) =>
    req<{ yeni_stok: number; yeni_seri: number; mukerrer: number; bos: number }>(
      `/api/depo/sayim/${oturum_id}/toplu-giris`,
      { method: "POST", body: JSON.stringify({ satirlar }) }
    ),
  topluCikis: (oturum_id: number, seri_no_listesi: string[], not_alani?: string) =>
    req<{ isaretlenen: number; zaten_cikis: number; bulunamadi: string[] }>(
      `/api/depo/sayim/${oturum_id}/toplu-cikis`,
      { method: "POST", body: JSON.stringify({ oturum_id, seri_no_listesi, not_alani }) }
    ),
  zimmetOzet: () => req<{ zimmetli_urun: number; zimmetli_calisan: number; bugun_hareket: number }>(
    "/api/depo/zimmet/ozet"
  ),
  zimmetCalisanlar: (q = "") => {
    const p = new URLSearchParams();
    if (q.trim()) p.set("q", q.trim());
    return req<ZimmetCalisan[]>(`/api/depo/zimmet/calisanlar${p.toString() ? `?${p}` : ""}`);
  },
  zimmetBarkodKontrol: (barkod: string) =>
    req<{ barkod: string; sonuclar: ZimmetUrun[] }>("/api/depo/zimmet/barkod-kontrol", {
      method: "POST", body: JSON.stringify({ barkod }),
    }),
  zimmetAta: (employee_id: number, seri_ids: number[], notu?: string, devir_onaylandi = false) =>
    req<{ atanan: number; devir: number; zaten_ayni_calisanda: number; calisan: string }>(
      "/api/depo/zimmet/ata",
      { method: "POST", body: JSON.stringify({ employee_id, seri_ids, notu, devir_onaylandi }) },
    ),
  zimmetIade: (seri_ids: number[], notu?: string) =>
    req<{ iade: number; zimmette_olmayan: number }>("/api/depo/zimmet/iade", {
      method: "POST", body: JSON.stringify({ seri_ids, notu }),
    }),
  zimmetCalisanDetay: (employee_id: number) =>
    req<ZimmetCalisanDetay>(`/api/depo/zimmet/calisan/${employee_id}`),
  zimmetHizli: (employee_id: number, stok_kodu: string, urun_adi?: string, seri_no?: string, notu?: string) =>
    req<{ seri_id: number; seri_no: string; stok_kodu: string; urun_adi: string; calisan: string }>(
      "/api/depo/zimmet/hizli",
      { method: "POST", body: JSON.stringify({ employee_id, stok_kodu, urun_adi, seri_no, notu }) },
    ),

  audit: (eylem?: string, kullanici_id?: number, limit = 100, offset = 0) => {
    const p = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (eylem) p.set("eylem", eylem);
    if (kullanici_id != null) p.set("kullanici_id", String(kullanici_id));
    return req<{ toplam: number; items: AuditSatir[] }>(`/api/depo/admin/audit?${p.toString()}`);
  },
  auditFiltre: (f: {
    eylem?: string; kullanici_id?: number; kaynak_tip?: string;
    oturum_id?: number; baslangic?: string; bitis?: string; q?: string;
    limit?: number; offset?: number;
  }) => {
    const p = new URLSearchParams();
    if (f.eylem) p.set("eylem", f.eylem);
    if (f.kullanici_id != null) p.set("kullanici_id", String(f.kullanici_id));
    if (f.kaynak_tip) p.set("kaynak_tip", f.kaynak_tip);
    if (f.oturum_id != null) p.set("oturum_id", String(f.oturum_id));
    if (f.baslangic) p.set("baslangic", f.baslangic);
    if (f.bitis) p.set("bitis", f.bitis);
    if (f.q) p.set("q", f.q);
    p.set("limit", String(f.limit ?? 100));
    p.set("offset", String(f.offset ?? 0));
    return req<{ toplam: number; items: AuditSatir[] }>(`/api/depo/admin/audit?${p.toString()}`);
  },
  auditEylemler: () => req<{ eylem: string; sayi: number }[]>("/api/depo/admin/audit/eylemler"),
  auditOturumlar: () => req<{ id: number; ad: string; lokasyon: string | null; durum: string }[]>("/api/depo/admin/audit/oturumlar"),
  auditExcel: (f: {
    eylem?: string; kullanici_id?: number; kaynak_tip?: string;
    oturum_id?: number; baslangic?: string; bitis?: string; q?: string;
  }) => {
    const p = new URLSearchParams();
    if (f.eylem) p.set("eylem", f.eylem);
    if (f.kullanici_id != null) p.set("kullanici_id", String(f.kullanici_id));
    if (f.kaynak_tip) p.set("kaynak_tip", f.kaynak_tip);
    if (f.oturum_id != null) p.set("oturum_id", String(f.oturum_id));
    if (f.baslangic) p.set("baslangic", f.baslangic);
    if (f.bitis) p.set("bitis", f.bitis);
    if (f.q) p.set("q", f.q);
    const t = tokens().access;
    return fetch(BASE + `/api/depo/admin/audit/excel?${p.toString()}`, {
      headers: t ? { Authorization: `Bearer ${t}` } : {},
    }).then(r => r.blob());
  },

  zimmetSenediBugun: (tarih?: string) => {
    const p = new URLSearchParams();
    if (tarih) p.set("tarih", tarih);
    const qs = p.toString();
    return req<ZimmetSenediBugun>(`/api/depo/zimmet-senedi/bugun${qs ? `?${qs}` : ""}`);
  },
  zimmetSenediPdf: async (depo_user_ids: number[], tarih?: string, employee_ids: number[] = []) => {
    const t = tokens().access;
    const r = await fetch(BASE + "/api/depo/zimmet-senedi/pdf", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(t ? { Authorization: `Bearer ${t}` } : {}),
      },
      body: JSON.stringify({ depo_user_ids, employee_ids, tarih }),
    });
    if (!r.ok) {
      let msg = `HTTP ${r.status}`;
      try { const j = await r.json(); msg = j.detail ?? msg; } catch { /* ignore */ }
      throw new Error(msg);
    }
    return r.blob();
  },
  zimmetSenediBosForm: async () => {
    const t = tokens().access;
    const r = await fetch(BASE + "/api/depo/zimmet-senedi/bos-form", {
      headers: t ? { Authorization: `Bearer ${t}` } : {},
    });
    if (!r.ok) {
      let msg = `HTTP ${r.status}`;
      try { const j = await r.json(); msg = j.detail ?? msg; } catch { /* ignore */ }
      throw new Error(msg);
    }
    return r.blob();
  },
};
