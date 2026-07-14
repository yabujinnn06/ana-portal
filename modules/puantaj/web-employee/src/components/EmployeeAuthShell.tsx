import { motion } from 'framer-motion'
import { type ReactNode } from 'react'

import { Masthead } from '../features/home-v2/components/Masthead'

// Activation (claim) ve recovery ekranlari icin ortak kabuk.
// HomePageV2 ile ayni cream/editorial dilde: arkaplan katmanlari + Masthead + ortalanmis icerik.
export function EmployeeAuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="relative min-h-screen overflow-x-hidden bg-cream font-sans text-ink antialiased">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0 opacity-[0.08]"
        style={{
          backgroundImage: 'repeating-linear-gradient(78deg, rgba(14,124,155,0.45) 0 1px, transparent 1px 26px)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background:
            'radial-gradient(ellipse at 50% -10%, rgba(14,124,155,0.10) 0%, transparent 55%), radial-gradient(ellipse at 100% 100%, rgba(245,158,11,0.05) 0%, transparent 50%)',
        }}
      />
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        {[8, 18, 31, 47, 62, 76, 89].map((left, i) => (
          <span
            key={left}
            className="absolute top-0 h-4 w-px bg-gradient-to-b from-transparent via-accent/25 to-transparent animate-rain-drop"
            style={{ left: `${left}%`, animationDelay: `${i * 0.6}s`, animationDuration: `${4.5 + (i % 4) * 0.8}s` }}
          />
        ))}
      </div>

      <div className="relative z-10 mx-auto max-w-[640px] px-5 py-7 sm:px-8 sm:py-10">
        <Masthead />
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        >
          {children}
        </motion.div>
      </div>
    </main>
  )
}
