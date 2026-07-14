import { useEffect, useState } from 'react'

import { FlipClock } from './FlipClock'

// Saat guncellemesini sayfadan izole eder: her tikte yalnizca bu bilesenler
// render olur. Saniye yok — dakika basina hizali tek guncelleme; sekme
// gizliyken timer tamamen durur (iOS'ta bosuna CPU/render yakmasin).
function useMinuteNow(): Date {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    let timeoutId: number | null = null

    const stop = () => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId)
        timeoutId = null
      }
    }

    const scheduleNextMinute = () => {
      const current = new Date()
      const msToNextMinute = 60_000 - (current.getSeconds() * 1000 + current.getMilliseconds())
      timeoutId = window.setTimeout(() => {
        setNow(new Date())
        scheduleNextMinute()
      }, msToNextMinute)
    }

    const handleVisibilityChange = () => {
      if (document.hidden) {
        stop()
      } else {
        setNow(new Date())
        stop()
        scheduleNextMinute()
      }
    }

    if (!document.hidden) {
      scheduleNextMinute()
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      stop()
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  return now
}

export function LiveFlipClock({ size = 'md' }: { size?: 'lg' | 'md' }) {
  const now = useMinuteNow()
  return <FlipClock date={now} showSeconds={false} size={size} />
}

export function LiveDateLabel({ className }: { className?: string }) {
  const now = useMinuteNow()
  return (
    <span className={className}>
      {now.toLocaleDateString('tr-TR', { day: '2-digit', month: 'long' })}
    </span>
  )
}
