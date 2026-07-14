import { motion } from 'framer-motion'

function Bone({ className }: { className: string }) {
  return (
    <div
      className={`rounded bg-ink/8 overflow-hidden relative ${className}`}
    >
      <motion.div
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(90deg, transparent 0%, rgba(14,124,155,0.08) 50%, transparent 100%)',
        }}
        animate={{ x: ['-100%', '100%'] }}
        transition={{ duration: 1.4, repeat: Infinity, ease: 'linear' }}
      />
    </div>
  )
}

export function HomePageV2Skeleton() {
  return (
    <div className="space-y-6">
      {/* Masthead skeleton */}
      <div className="flex items-center justify-between pb-4 border-b border-rule mb-6">
        <div className="flex items-center gap-3">
          <Bone className="h-9 w-9 rounded-full" />
          <div className="space-y-1.5">
            <Bone className="h-4 w-16" />
            <Bone className="h-3 w-24" />
          </div>
        </div>
        <div className="space-y-1.5 text-right">
          <Bone className="h-3 w-20 ml-auto" />
          <Bone className="h-2.5 w-28 ml-auto" />
        </div>
      </div>

      {/* HeroStatus skeleton */}
      <div className="rounded-md border border-rule bg-paper p-6 space-y-5">
        <div className="flex items-center justify-between">
          <Bone className="h-3 w-28" />
          <Bone className="h-3 w-16" />
        </div>
        {/* Flip clock placeholder */}
        <div className="flex justify-center gap-1 py-2">
          {[0,1,2,3].map(i => (
            <Bone key={i} className="h-[76px] w-[54px] rounded" />
          ))}
        </div>
        <Bone className="h-3 w-40 mx-auto" />
        <div className="border-t border-rule pt-4 space-y-2">
          <Bone className="h-3 w-36" />
          <Bone className="h-8 w-24" />
        </div>
        <Bone className="h-12 w-full rounded-md" />
      </div>

      {/* TodayLedger skeleton */}
      <div className="rounded-md border border-rule bg-paper overflow-hidden">
        <div className="border-b border-rule px-5 py-3 bg-accent-soft/30">
          <Bone className="h-3 w-14" />
        </div>
        <div className="grid grid-cols-3 divide-x divide-rule">
          {[0,1,2].map(i => (
            <div key={i} className="px-4 py-5 space-y-2">
              <Bone className="h-2.5 w-12" />
              <Bone className="h-6 w-16" />
            </div>
          ))}
        </div>
      </div>

      {/* QuickActions skeleton */}
      <div className="space-y-3">
        <div className="flex justify-between items-center px-1">
          <Bone className="h-5 w-20" />
          <Bone className="h-3 w-12" />
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          {[0,1,2,3].map(i => (
            <div key={i} className="rounded-md border border-rule bg-paper px-4 py-4 space-y-3">
              <Bone className="h-9 w-9 rounded-full" />
              <Bone className="h-4 w-16" />
              <Bone className="h-3 w-20" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
