import { motion } from "framer-motion";
import { DurumSayim } from "../../lib/api";

const renkler: Record<string, string> = {
  basarili: "#5FBE7A",
  mukerrer: "#F4B183",
  bulunamadi: "#DC5A5A",
  cakisma: "#BF6F34",
  bos: "#9AA4B2",
};

const etiketler: Record<string, string> = {
  basarili: "Başarılı",
  mukerrer: "Mükerrer",
  bulunamadi: "Bulunamadı",
  cakisma: "Çakışma",
};

export default function DurumDonut({ data }: { data: DurumSayim[] }) {
  const toplam = data.reduce((a, b) => a + b.sayi, 0);
  const R = 70;
  const stroke = 22;
  const C = 2 * Math.PI * R;
  let aci = 0;

  return (
    <div className="card p-5">
      <div className="text-[11px] uppercase tracking-label text-ink/55 mb-3">Durum dağılımı</div>
      <div className="flex items-center gap-5">
        <svg width="170" height="170" viewBox="0 0 170 170" className="-rotate-90">
          <circle cx="85" cy="85" r={R} stroke="#E8E0D0" strokeWidth={stroke} fill="none" />
          {data.map((d) => {
            const oran = toplam > 0 ? d.sayi / toplam : 0;
            const uzunluk = C * oran;
            const renk = renkler[d.durum] ?? "#7FB3E0";
            const offset = aci;
            aci += uzunluk;
            return (
              <motion.circle
                key={d.durum}
                cx="85" cy="85" r={R}
                fill="none" stroke={renk} strokeWidth={stroke}
                strokeDasharray={`${uzunluk} ${C - uzunluk}`}
                strokeDashoffset={-offset}
                strokeLinecap="butt"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.6, ease: "easeOut" }}
              />
            );
          })}
          <text x="85" y="80" textAnchor="middle" className="rotate-90 origin-center"
            style={{ transform: "rotate(90deg)", transformOrigin: "85px 85px", fontFamily: "Inter, sans-serif", fontWeight: 600, fontSize: 26 }}
            fill="#0F2A44">
            {toplam}
          </text>
          <text x="85" y="100" textAnchor="middle"
            style={{ transform: "rotate(90deg)", transformOrigin: "85px 85px", fontFamily: "Inter", fontSize: 10, letterSpacing: 2, textTransform: "uppercase" }}
            fill="#6A6A6A">
            TARAMA
          </text>
        </svg>
        <ul className="flex-1 space-y-1.5 text-sm">
          {data.map(d => {
            const oran = toplam > 0 ? (d.sayi / toplam) * 100 : 0;
            return (
              <li key={d.durum} className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: renkler[d.durum] ?? "#7FB3E0" }} />
                <span className="flex-1">{etiketler[d.durum] ?? d.durum}</span>
                <span className="font-mono tabular-nums font-semibold">{d.sayi}</span>
                <span className="font-mono text-xs text-ink/55 w-10 text-right">{oran.toFixed(0)}%</span>
              </li>
            );
          })}
          {data.length === 0 && <li className="text-ink/55 text-sm">Henüz tarama yok.</li>}
        </ul>
      </div>
    </div>
  );
}
