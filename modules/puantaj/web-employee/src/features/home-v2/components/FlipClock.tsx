import { useEffect, useState } from 'react'

import { cn } from '../../../utils/cn'

interface FlipDigitProps {
  value: string
  size?: 'lg' | 'md' | 'sm'
}

const PAPER_TOP = '#f5efe2'
const PAPER_BOTTOM = '#ece4d2'
const INK_DARK = '#1a2b36'

function FlipDigit({ value, size = 'lg' }: FlipDigitProps) {
  const [prev, setPrev] = useState(value)
  const [flipping, setFlipping] = useState(false)

  useEffect(() => {
    if (value !== prev) {
      setFlipping(true)
      // flip-top (0.28s) + flip-bottom (0.28s after 0.28s) = 0.56s toplam
      const t = window.setTimeout(() => {
        setPrev(value)
        setFlipping(false)
      }, 560)
      return () => window.clearTimeout(t)
    }
  }, [value, prev])

  const dim =
    size === 'lg'
      ? { w: 'w-[54px] sm:w-[72px]', h: 'h-[76px] sm:h-[100px]', fs: 'text-[60px] sm:text-[82px]' }
      : size === 'md'
        ? { w: 'w-[32px] sm:w-[40px]', h: 'h-[46px] sm:h-[60px]', fs: 'text-[36px] sm:text-[48px]' }
        : { w: 'w-[22px] sm:w-[26px]', h: 'h-[32px] sm:h-[40px]', fs: 'text-[24px] sm:text-[30px]' }

  const fullDigit = (txt: string) => (
    <div
      className={cn('absolute inset-0 flex items-center justify-center select-none', dim.fs)}
      style={{
        color: INK_DARK,
        fontWeight: 800,
        letterSpacing: '-0.02em',
        lineHeight: 1,
        fontFamily: '"Inter Tight", system-ui, sans-serif',
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {txt}
    </div>
  )

  return (
    <div
      className={cn(
        'relative inline-block rounded-[5px]',
        'shadow-[0_1px_2px_rgba(26,43,54,0.18),0_8px_18px_-10px_rgba(26,43,54,0.4)]',
        dim.w,
        dim.h,
      )}
      style={{
        perspective: '600px',
        transformStyle: 'preserve-3d',
      }}
      aria-hidden
    >
      {/* STATIC TOP - VALUE ust yarisi */}
      <div
        className="absolute inset-0 overflow-hidden rounded-[5px]"
        style={{
          backgroundColor: PAPER_TOP,
          clipPath: 'inset(0 0 50% 0)',
        }}
      >
        {fullDigit(value)}
      </div>

      {/* STATIC BOTTOM - PREV alt yarisi */}
      <div
        className="absolute inset-0 overflow-hidden rounded-[5px]"
        style={{
          backgroundColor: PAPER_BOTTOM,
          clipPath: 'inset(50% 0 0 0)',
        }}
      >
        {fullDigit(prev)}
      </div>

      {/* Divider seam */}
      <span
        aria-hidden
        className="absolute left-0 right-0 top-1/2 z-30 pointer-events-none"
        style={{
          height: '2px',
          marginTop: '-1px',
          background:
            'linear-gradient(180deg, rgba(26,43,54,0.28) 0%, rgba(26,43,54,0.28) 50%, rgba(255,255,255,0.6) 50%, rgba(255,255,255,0.6) 100%)',
        }}
      />

      {/* Outer kart kenari */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[5px]"
        style={{
          boxShadow: 'inset 0 0 0 1px rgba(26,43,54,0.16)',
        }}
      />

      {flipping && (
        <>
          {/* FLIP TOP - PREV ust yarisi, 0 -> -90 (ease-in, yer cekimi) */}
          <div
            key={`top-${prev}-${value}`}
            className="absolute inset-0 z-20 origin-bottom rounded-[5px] animate-flip-top overflow-hidden"
            style={{
              backgroundColor: PAPER_TOP,
              clipPath: 'inset(0 0 50% 0)',
              backfaceVisibility: 'hidden',
              transformStyle: 'preserve-3d',
              boxShadow:
                '0 6px 12px -4px rgba(26,43,54,0.5), inset 0 0 0 1px rgba(26,43,54,0.16)',
            }}
          >
            {fullDigit(prev)}
            {/* alt kenar gradient - dusen kartin govdesi */}
            <span
              aria-hidden
              className="absolute inset-x-0 bottom-0 h-3"
              style={{
                background:
                  'linear-gradient(180deg, transparent 0%, rgba(26,43,54,0.18) 100%)',
              }}
            />
          </div>

          {/* FLIP BOTTOM - VALUE alt yarisi, 90 -> 0 (ease-out, yumusak duruş) */}
          <div
            key={`bot-${prev}-${value}`}
            className="absolute inset-0 z-20 origin-top rounded-[5px] animate-flip-bottom overflow-hidden"
            style={{
              backgroundColor: PAPER_BOTTOM,
              clipPath: 'inset(50% 0 0 0)',
              backfaceVisibility: 'hidden',
              transform: 'rotateX(90deg)',
              transformStyle: 'preserve-3d',
              boxShadow:
                '0 -6px 12px -4px rgba(26,43,54,0.5), inset 0 0 0 1px rgba(26,43,54,0.16)',
            }}
          >
            {fullDigit(value)}
            {/* ust kenar highlight - acilan kartin govdesi */}
            <span
              aria-hidden
              className="absolute inset-x-0 top-0 h-3"
              style={{
                background:
                  'linear-gradient(180deg, rgba(255,255,255,0.5) 0%, transparent 100%)',
              }}
            />
          </div>
        </>
      )}
    </div>
  )
}

interface FlipClockProps {
  date: Date
  showSeconds?: boolean
  size?: 'lg' | 'md'
}

function pad(n: number) {
  return n.toString().padStart(2, '0')
}

function Colon({ small, tiny }: { small?: boolean; tiny?: boolean }) {
  const sizeClass = tiny
    ? 'h-[32px] sm:h-[40px] mx-px'
    : small
      ? 'h-[46px] sm:h-[60px] mx-px'
      : 'h-[76px] sm:h-[100px] mx-0.5'
  const dot = tiny ? '2.5px' : small ? '3px' : '5px'
  return (
    <div className={cn('inline-flex flex-col justify-center gap-1.5 sm:gap-2', sizeClass)} aria-hidden>
      <span className="block rounded-full bg-ink/55 animate-pulse" style={{ width: dot, height: dot }} />
      <span className="block rounded-full bg-ink/55 animate-pulse" style={{ width: dot, height: dot }} />
    </div>
  )
}

export function FlipClock({ date, showSeconds = true, size = 'lg' }: FlipClockProps) {
  const hh = pad(date.getHours())
  const mm = pad(date.getMinutes())
  const ss = pad(date.getSeconds())
  const compact = size === 'md'

  return (
    <div className="inline-flex items-center gap-[3px] sm:gap-1">
      <FlipDigit value={hh[0]} size={size} />
      <FlipDigit value={hh[1]} size={size} />
      <Colon small={compact} />
      <FlipDigit value={mm[0]} size={size} />
      <FlipDigit value={mm[1]} size={size} />
      {showSeconds && (
        <>
          <Colon tiny />
          <FlipDigit value={ss[0]} size="sm" />
          <FlipDigit value={ss[1]} size="sm" />
        </>
      )}
    </div>
  )
}
