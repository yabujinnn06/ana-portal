import { useEffect, useMemo, useState } from "react";

type StockRow = { sku: string; product_name: string; warehouse_code: string; location_code: string; quantity: string; lot_no?: string | null };
type Transfer = { transfer_no: string; status: string; source_warehouse_id: number; destination_warehouse_id: number };
type Dispatch = { dispatch_no: string; customer_name: string; customer_site?: string | null; status: string; shipped_at?: string | null };
type DispatchForm = { source_location_id: string; customer_name: string; customer_site: string; document_no: string; product_id: string; quantity: string; lot_no: string };

const api = async <T,>(path: string): Promise<T> => {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
  return response.json();
};

const post = async <T,>(path: string, body: unknown): Promise<T> => {
  const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
  return response.json();
};

function Status({ value }: { value: string }) {
  return <span className={`status status-${value.toLowerCase().replaceAll("_", "-")}`}>{value}</span>;
}

const emptyForm: DispatchForm = { source_location_id: "", customer_name: "", customer_site: "", document_no: "", product_id: "", quantity: "", lot_no: "" };

export default function App() {
  const [stocks, setStocks] = useState<StockRow[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [dispatches, setDispatches] = useState<Dispatch[]>([]);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [showDispatch, setShowDispatch] = useState(false);
  const [savingDispatch, setSavingDispatch] = useState(false);
  const [dispatchForm, setDispatchForm] = useState<DispatchForm>(emptyForm);

  const refresh = async () => {
    setRefreshing(true); setError("");
    try {
      const [stock, transfer, dispatch] = await Promise.all([api<StockRow[]>("/api/v1/stock/balances"), api<Transfer[]>("/api/v1/reports/transfers"), api<Dispatch[]>("/api/v1/reports/dispatches")]);
      setStocks(stock); setTransfers(transfer); setDispatches(dispatch);
    } catch (e) { setError(e instanceof Error ? e.message : "API connection failed"); }
    finally { setRefreshing(false); }
  };

  useEffect(() => { void refresh(); }, []);
  const totalUnits = useMemo(() => stocks.reduce((sum, row) => sum + Number(row.quantity), 0), [stocks]);
  const inTransit = transfers.filter(t => t.status === "IN_TRANSIT").length;
  const pendingDispatches = dispatches.filter(d => d.status !== "DELIVERED").length;

  const submitDispatch = async (event: React.FormEvent) => {
    event.preventDefault(); setSavingDispatch(true); setError("");
    try {
      await post("/api/v1/operations/dispatches", { source_location_id: Number(dispatchForm.source_location_id), customer_name: dispatchForm.customer_name, customer_site: dispatchForm.customer_site || null, document_no: dispatchForm.document_no || null, lines: [{ product_id: Number(dispatchForm.product_id), quantity: dispatchForm.quantity, lot_no: dispatchForm.lot_no || null }] });
      setShowDispatch(false); setDispatchForm(emptyForm); await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Dispatch could not be created"); }
    finally { setSavingDispatch(false); }
  };

  const field = (key: keyof DispatchForm) => (event: React.ChangeEvent<HTMLInputElement>) => setDispatchForm({ ...dispatchForm, [key]: event.target.value });

  return <div className="shell">
    <aside className="sidebar"><div className="brand"><span className="brand-mark">R</span><div><strong>RAINWATER</strong><small>ANA PORTAL</small></div></div><nav><a className="active">Dashboard</a><a>Products and Stock</a><a>Warehouses</a><a>Transfers</a><a>Customer Dispatches</a><a>Physical Counts</a><a>Reports</a></nav><div className="sidebar-foot">Warehouse module v0.1<br /><span>Live API</span></div></aside>
    <main className="content"><header><div><p className="eyebrow">OPERATIONS CENTER</p><h1>Warehouse overview</h1><p className="muted">Stock, transfers and customer dispatches in one view.</p></div><button onClick={() => void refresh()} disabled={refreshing}>{refreshing ? "Refreshing..." : "Refresh data"}</button></header>
      {error && <div className="alert">{error}<span>Start the backend with <code>uvicorn app.main:app --reload</code>.</span></div>}
      <section className="metrics"><article><span>Total stock</span><strong>{totalUnits.toLocaleString("tr-TR")}</strong><small>all locations</small></article><article><span>Stock lines</span><strong>{stocks.length}</strong><small>lot/location rows</small></article><article><span>In transit</span><strong>{inTransit}</strong><small>awaiting receipt</small></article><article><span>Open dispatches</span><strong>{pendingDispatches}</strong><small>awaiting delivery</small></article></section>
      <section className="grid-two"><div className="panel"><div className="panel-head"><div><h2>Current stock</h2><p>Live balance by location and lot</p></div><button className="quiet">View all</button></div><div className="table-wrap"><table><thead><tr><th>Product</th><th>Warehouse / bin</th><th>Lot</th><th className="right">Quantity</th></tr></thead><tbody>{stocks.length ? stocks.slice(0, 8).map((row, i) => <tr key={`${row.sku}-${row.location_code}-${i}`}><td><b>{row.sku}</b><small>{row.product_name}</small></td><td>{row.warehouse_code}<small>{row.location_code}</small></td><td>{row.lot_no || "-"}</td><td className="right"><b>{row.quantity}</b></td></tr>) : <tr><td colSpan={4} className="empty">No stock movements yet.</td></tr>}</tbody></table></div></div><div className="panel"><div className="panel-head"><div><h2>Transfer flow</h2><p>Warehouse-to-warehouse movements</p></div></div><div className="activity">{transfers.length ? transfers.slice(0, 6).map(t => <div className="activity-row" key={t.transfer_no}><span className="dot dot-blue" /><div><b>{t.transfer_no}</b><small>{t.source_warehouse_id} -&gt; {t.destination_warehouse_id}</small></div><Status value={t.status} /></div>) : <p className="empty">No transfers yet.</p>}</div></div></section>
      <section className="panel"><div className="panel-head"><div><h2>Customer dispatches</h2><p>Shipped, awaiting delivery and completed operations</p></div><button className="primary" onClick={() => setShowDispatch(true)}>New dispatch</button></div><div className="table-wrap"><table><thead><tr><th>Dispatch no</th><th>Customer / site</th><th>Status</th><th>Date</th></tr></thead><tbody>{dispatches.length ? dispatches.slice(0, 8).map(d => <tr key={d.dispatch_no}><td><b>{d.dispatch_no}</b></td><td>{d.customer_name}<small>{d.customer_site || "Site not specified"}</small></td><td><Status value={d.status} /></td><td>{d.shipped_at ? new Date(d.shipped_at).toLocaleDateString("tr-TR") : "-"}</td></tr>) : <tr><td colSpan={4} className="empty">No customer dispatches yet.</td></tr>}</tbody></table></div></section>
      {showDispatch && <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setShowDispatch(false); }}><form className="modal" onSubmit={submitDispatch}><div className="modal-head"><div><p className="eyebrow">WAREHOUSE OPERATION</p><h2>New customer dispatch</h2></div><button type="button" className="quiet" onClick={() => setShowDispatch(false)}>Close</button></div><div className="form-grid"><label>Customer<input required value={dispatchForm.customer_name} onChange={field("customer_name")} /></label><label>Site<input value={dispatchForm.customer_site} onChange={field("customer_site")} /></label><label>Source location ID<input required type="number" min="1" value={dispatchForm.source_location_id} onChange={field("source_location_id")} /></label><label>Document no<input value={dispatchForm.document_no} onChange={field("document_no")} /></label><label>Product ID<input required type="number" min="1" value={dispatchForm.product_id} onChange={field("product_id")} /></label><label>Quantity<input required type="number" min="0.001" step="0.001" value={dispatchForm.quantity} onChange={field("quantity")} /></label><label>Lot no<input value={dispatchForm.lot_no} onChange={field("lot_no")} /></label></div><div className="modal-actions"><button type="button" onClick={() => setShowDispatch(false)}>Cancel</button><button className="primary" disabled={savingDispatch}>{savingDispatch ? "Saving..." : "Create dispatch draft"}</button></div></form></div>}
    </main>
  </div>;
}
