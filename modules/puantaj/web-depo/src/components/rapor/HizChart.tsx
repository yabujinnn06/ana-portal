import { motion } from "framer-motion";
import { DakikaSayim } from "../../lib/api";

export default function HizChart({ rows, hiz }: { rows: DakikaSayim[]; hiz: number }) {
  const w = 520;
  const h = 140;
  const padding = { top: 18, right: 12, bottom: 26, left: 28 };
  const iw = w - padding.left - padding.right;
  const ih = h - padding.top - padding.bottom;

  const maks = Math.max(1, ...rows.map(r => r.basarili + r.diger));
  const N = Math.max(rows.length, 1);
  const barW = iw / N;

  return (
    <div className="card p-5">
      <div className="flex items-end justify-between mb-3">
        <div>
          <div className="text-[11px] uppercase tracking-label text-ink/55">Tarama hızı</div>
          <div className="font-semibold text-2xl leading-none mt-1 tabular-nums">
            {hiz.toFixed(1)} <span className="text-base text-ink/60 font-normal">tarama/dk</span>
          </div>
        </div>
        <div className="text-xs text-ink/55 font-mono">{rows.length} dakika kovasi</div>
      </div>

      <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
        {[0.25, 0.5, 0.75, 1].map((t) => (
          <line
            key={t}
            x1={padding.left} x2={w - padding.right}
            y1={padding.top + ih * (1 - t)} y2={padding.top + ih * (1 - t)}
            stroke="#E8E0D0" strokeDasharray="3 3"
          />
        ))}
        {rows.map((r, i) => {
          const top = r.basarili + r.diger;
          const hOk = (r.basarili / maks) * ih;
          const hOth = (r.diger / maks) * ih;
          const x = padding.left + i * barW + 2;
          const yOk = padding.top + ih - hOk;
          const yOth = yOk - hOth;
          return (
            <g key={i}>
              <motion.rect
                x={x} width={Math.max(barW - 4, 2)}
                initial={{ y: padding.top + ih, height: 0 }}
                animate={{ y: yOk, height: hOk }}
                transition={{ duration: 0.4, delay: i * 0.01 }}
                fill="#5FBE7A" rx={2}
              />
              {r.diger > 0 && (
                <motion.rect
                  x={x} width={Math.max(barW - 4, 2)}
                  initial={{ y: padding.top + ih, height: 0 }}
                  animate={{ y: yOth, height: hOth }}
                  transition={{ duration: 0.4, delay: i * 0.01 + 0.05 }}
                  fill="#F4B183" rx={2}
                />
              )}
              {i === 0 || i === rows.length - 1 || i === Math.floor(rows.length / 2) ? (
                <text x={x + (barW - 4) / 2} y={h - 8} textAnchor="middle"
                  style={{ fontSize: 10, fontFamily: "JetBrains Mono, monospace" }}
                  fill="#6A6A6A">
                  {new Date(r.zaman).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}
                </text>
              ) : null}
            </g>
          );
        })}
        <text x={padding.left - 6} y={padding.top + 4} textAnchor="end"
          style={{ fontSize: 10, fontFamily: "JetBrains Mono, monospace" }} fill="#6A6A6A">
          {maks}
        </text>
        <text x={padding.left - 6} y={padding.top + ih + 4} textAnchor="end"
          style={{ fontSize: 10, fontFamily: "JetBrains Mono, monospace" }} fill="#6A6A6A">
          0
        </text>
      </svg>

      <div className="flex items-center gap-4 text-xs mt-2">
        <span className="flex items-center gap-1.5"><span className="h-2 w-3 rounded-sm bg-good" />Basarili</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-3 rounded-sm bg-warn" />Diger</span>
      </div>
    </div>
  );
}
