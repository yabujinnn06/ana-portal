import { motion } from "framer-motion";
import { User, CheckCircle2, AlertTriangle, XCircle, GitMerge } from "lucide-react";
import { KullaniciIstatistik } from "../../lib/api";
import NumberTicker from "../ui/NumberTicker";

export default function KullaniciKartlari({ rows }: { rows: KullaniciIstatistik[] }) {
  if (rows.length === 0) {
    return (
      <div className="card p-5 text-center text-ink/55">
        Henüz kimse sayım yapmamış.
      </div>
    );
  }
  return (
    <div className="grid sm:grid-cols-2 gap-3">
      {rows.map((u, i) => (
        <motion.div
          key={u.kullanici_id ?? `x${i}`}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.04 }}
          className="card p-4"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="h-9 w-9 rounded-full bg-deep text-white flex items-center justify-center">
                <User size={16} />
              </div>
              <div>
                <div className="font-semibold text-[15px] leading-tight">{u.ad}</div>
                {u.son_tarama && (
                  <div className="text-[11px] text-ink/55">
                    son: {new Date(u.son_tarama).toLocaleString("tr-TR")}
                  </div>
                )}
              </div>
            </div>
            <div className="text-right">
              <div className="font-semibold text-2xl text-accent leading-none tabular-nums">
                <NumberTicker value={u.toplam_tarama} />
              </div>
              <div className="text-[11px] uppercase tracking-label text-ink/55">tarama</div>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-4 gap-2 text-xs">
            <Mini icon={<CheckCircle2 size={12} className="text-good-ink" />} v={u.basarili} k="OK" />
            <Mini icon={<AlertTriangle size={12} className="text-warn-ink" />} v={u.mukerrer} k="MÜK" />
            <Mini icon={<XCircle size={12} className="text-bad-ink" />} v={u.bulunamadi} k="YOK" />
            <Mini icon={<GitMerge size={12} className="text-warn-ink" />} v={u.cakisma} k="ÇAK" />
          </div>
        </motion.div>
      ))}
    </div>
  );
}

function Mini({ icon, v, k }: { icon: React.ReactNode; v: number; k: string }) {
  return (
    <div className="rounded-md bg-cream/70 px-2 py-1.5 flex items-center justify-between gap-1">
      <span className="flex items-center gap-1 text-ink/55 font-mono">{icon}{k}</span>
      <span className="font-mono font-semibold tabular-nums">{v}</span>
    </div>
  );
}
