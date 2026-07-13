import { useEffect, useMemo, useState } from "react";

type StockRow = { sku: string; product_name: string; warehouse_code: string; location_code: string; quantity: string; lot_no?: string | null };
type Transfer = { transfer_no: string; status: string; source_warehouse_id: number; destination_warehouse_id: number; created_at?: string };
type Dispatch = { dispatch_no: string; customer_name: string; customer_site?: string | null; status: string; shipped_at?: string | null };

const api = async <T,>(path: string): Promise<T> => {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
  return response.json();
};

function Status({ value }: { value: string }) { return <span className={`status status-${value.toLowerCase().replaceAll("_", "-")}`}>{value}</span>; }

export default function App() {
  const [stocks, setStocks] = useState<StockRow[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [dispatches, setDispatches] = useState<Dispatch[]>([]);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const refresh = async () => {
    setRefreshing(true); setError("");
    try { const [s, t, d] = await Promise.all([api<StockRow[]>("/api/v1/stock/balances"), api<Transfer[]>("/api/v1/reports/transfers"), api<Dispatch[]>("/api/v1/reports/dispatches")]); setStocks(s); setTransfers(t); setDispatches(d); }
    catch (e) { setError(e instanceof Error ? e.message : "API bağlantısı kurulamadı"); }
    finally { setRefreshing(false); }
  };
  useEffect(() => { void refresh(); }, []);
  const totalUnits = useMemo(() => stocks.reduce((sum, row) => sum + Number(row.quantity), 0), [stocks]);
  const inTransit = transfers.filter(t => t.status === "IN_TRANSIT").length;
  const pendingDispatches = dispatches.filter(d => d.status !== "DELIVERED").length;

  return <div className="shell">
    <aside className="sidebar"><div className="brand"><span className="brand-mark">R</span><div><strong>RAINWATER</strong><small>ANA PORTAL</small></div></div><nav><a className="active">Genel Bakış</a><a>Stok ve Ürünler</a><a>Depolar</a><a>Transferler</a><a>Müşteri Sevkleri</a><a>Fiili Sayım</a><a>Raporlar</a></nav><div className="sidebar-foot">Depo modülü v0.1<br /><span>API bağlantısı bekleniyor</span></div></aside>
    <main className="content"><header><div><p className="eyebrow">OPERASYON MERKEZİ</p><h1>Depo genel bakış</h1><p className="muted">Stok, transfer ve müşteri sevklerinin tek görünümü.</p></div><button onClick={() => void refresh()} disabled={refreshing}>{refreshing ? "Yenileniyor…" : "Veriyi yenile"}</button></header>
      {error && <div className="alert">{error}<span>Backend’i <code>uvicorn app.main:app --reload</code> ile çalıştır.</span></div>}
      <section className="metrics"><article><span>Toplam stok</span><strong>{totalUnits.toLocaleString("tr-TR")}</strong><small>tüm lokasyonlar</small></article><article><span>Stok kalemi</span><strong>{stocks.length}</strong><small>lot/lokasyon satırı</small></article><article><span>Transferde</span><strong>{inTransit}</strong><small>hedef depoya bekleyen</small></article><article><span>Açık müşteri sevki</span><strong>{pendingDispatches}</strong><small>teslim bekleyen</small></article></section>
      <section className="grid-two"><div className="panel"><div className="panel-head"><div><h2>Mevcut stok</h2><p>Lokasyon ve lot bazlı canlı bakiye</p></div><button className="quiet">Tümünü gör</button></div><div className="table-wrap"><table><thead><tr><th>Ürün</th><th>Depo / raf</th><th>Lot</th><th className="right">Miktar</th></tr></thead><tbody>{stocks.length ? stocks.slice(0, 8).map((row, i) => <tr key={`${row.sku}-${row.location_code}-${i}`}><td><b>{row.sku}</b><small>{row.product_name}</small></td><td>{row.warehouse_code}<small>{row.location_code}</small></td><td>{row.lot_no || "—"}</td><td className="right"><b>{row.quantity}</b></td></tr>) : <tr><td colSpan={4} className="empty">Henüz stok hareketi yok.</td></tr>}</tbody></table></div></div><div className="panel"><div className="panel-head"><div><h2>Transfer akışı</h2><p>Depolar arası hareket durumu</p></div></div><div className="activity">{transfers.length ? transfers.slice(0, 6).map(t => <div className="activity-row" key={t.transfer_no}><span className="dot dot-blue" /><div><b>{t.transfer_no}</b><small>{t.source_warehouse_id} → {t.destination_warehouse_id}</small></div><Status value={t.status} /></div>) : <p className="empty">Henüz transfer yok.</p>}</div></div></section>
      <section className="panel"><div className="panel-head"><div><h2>Müşteri sevkleri</h2><p>Sevk edildi, teslim bekliyor ve tamamlanan işlemler</p></div><button className="primary">Yeni sevk oluştur</button></div><div className="table-wrap"><table><thead><tr><th>Sevk no</th><th>Müşteri / saha</th><th>Durum</th><th>Tarih</th></tr></thead><tbody>{dispatches.length ? dispatches.slice(0, 8).map(d => <tr key={d.dispatch_no}><td><b>{d.dispatch_no}</b></td><td>{d.customer_name}<small>{d.customer_site || "Saha belirtilmemiş"}</small></td><td><Status value={d.status} /></td><td>{d.shipped_at ? new Date(d.shipped_at).toLocaleDateString("tr-TR") : "—"}</td></tr>) : <tr><td colSpan={4} className="empty">Henüz müşteri sevki yok.</td></tr>}</tbody></table></div></section>
    </main>
  </div>;
}
