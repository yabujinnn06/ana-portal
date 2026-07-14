import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

import type {
  LocationMonitorGeofence,
  LocationMonitorMapPoint,
  LocationMonitorPointSource,
  LocationMonitorRepeatedPoint,
} from '../../types/api'

const DATE_TIME_FORMAT = new Intl.DateTimeFormat('tr-TR', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

const CLOCK_FORMAT = new Intl.DateTimeFormat('tr-TR', {
  timeZone: 'Europe/Istanbul',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

function pointClock(value: string): string {
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? '-' : CLOCK_FORMAT.format(parsed)
}

function markerStyle(
  source: LocationMonitorPointSource,
  markerKind: LocationMonitorMapPoint['marker_kind'],
  focused: boolean,
): L.CircleMarkerOptions {
  const base: L.CircleMarkerOptions = {
    radius: focused ? 8 : 6,
    color: '#0f172a',
    fillColor: '#38bdf8',
    fillOpacity: focused ? 0.95 : 0.88,
    weight: focused ? 3 : 2,
  }

  if (source === 'CHECKIN') {
    return { ...base, fillColor: '#22c55e', color: '#166534' }
  }
  if (source === 'CHECKOUT') {
    return { ...base, fillColor: '#f43f5e', color: '#9f1239', radius: focused ? 8.5 : 6.5 }
  }
  if (source === 'APP_OPEN') {
    return { ...base, fillColor: '#f59e0b', color: '#b45309', radius: focused ? 7.5 : 5.75 }
  }
  if (source === 'APP_CLOSE') {
    return { ...base, fillColor: '#818cf8', color: '#4338ca', radius: focused ? 7.5 : 5.75 }
  }
  if (source === 'DEMO_START') {
    return { ...base, fillColor: '#22d3ee', color: '#0f766e' }
  }
  if (source === 'DEMO_END') {
    return { ...base, fillColor: '#a78bfa', color: '#6d28d9' }
  }
  if (markerKind === 'JUMP') {
    return { ...base, fillColor: '#ef4444', color: '#7f1d1d', radius: focused ? 8.5 : 6.75 }
  }
  if (markerKind === 'LAST') {
    return { ...base, fillColor: '#0ea5e9', color: '#0f172a', radius: focused ? 9 : 7 }
  }
  return { ...base, fillColor: '#38bdf8', color: '#0369a1' }
}

function numberedIcon(
  seq: number,
  point: LocationMonitorMapPoint,
  focused: boolean,
  isFirst: boolean,
  isLast: boolean,
): L.DivIcon {
  const style = markerStyle(point.source, point.marker_kind, focused)
  const bg = (style.fillColor as string) ?? '#38bdf8'
  const border = (style.color as string) ?? '#0369a1'
  const size = isFirst || isLast ? 30 : focused ? 28 : 24
  const cls = [
    'cr-route-pin',
    focused ? 'is-focused' : '',
    isFirst ? 'is-first' : '',
    isLast ? 'is-last' : '',
  ]
    .filter(Boolean)
    .join(' ')
  return L.divIcon({
    className: 'cr-route-pin-shell',
    html: `<span class="${cls}" style="--pin-bg:${bg};--pin-bd:${border};width:${size}px;height:${size}px;">${seq}</span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  })
}

function pointSourceLabel(value: LocationMonitorMapPoint['source']): string {
  if (value === 'CHECKIN') return 'Mesai girişi'
  if (value === 'CHECKOUT') return 'Mesai cikisi'
  if (value === 'APP_OPEN') return 'Uygulama girişi'
  if (value === 'APP_CLOSE') return 'Uygulama cikisi'
  if (value === 'DEMO_START') return 'Demo baslangici'
  if (value === 'DEMO_END') return 'Demo bitisi'
  if (value === 'LOCATION_PING') return 'Konum pingi'
  return 'Son bilinen konum'
}

function pointPopup(point: LocationMonitorMapPoint): string {
  const parsedDate = new Date(point.ts_utc)
  const timestamp = Number.isNaN(parsedDate.getTime()) ? point.ts_utc : DATE_TIME_FORMAT.format(parsedDate)
  const trust = point.trust_score == null ? '-' : `${point.trust_score}/100`
  const accuracy = point.accuracy_m == null ? '-' : `${Math.round(point.accuracy_m)} m`
  const geofence = point.geofence_status ?? '-'
  return [
    `<strong style="display:block;font-size:13px;margin-bottom:4px;">${point.label}</strong>`,
    `<div style="font-size:12px;line-height:1.5;">`,
    `<div><strong>Tip:</strong> ${pointSourceLabel(point.source)}</div>`,
    `<div><strong>Zaman:</strong> ${timestamp}</div>`,
    `<div><strong>Konum:</strong> ${point.lat.toFixed(6)}, ${point.lon.toFixed(6)}</div>`,
    `<div><strong>Doğruluk:</strong> ${accuracy}</div>`,
    `<div><strong>Trust:</strong> ${trust}</div>`,
    `<div><strong>Geofence:</strong> ${geofence}</div>`,
    `<div><strong>Cihaz:</strong> ${point.device_id == null ? '-' : `#${point.device_id}`}</div>`,
    `<div><strong>IP:</strong> ${point.ip ?? '-'}</div>`,
    `</div>`,
  ].join('')
}

function buildDisplayPoints(points: LocationMonitorMapPoint[]): LocationMonitorMapPoint[] {
  return [...points].sort((left, right) => new Date(left.ts_utc).getTime() - new Date(right.ts_utc).getTime())
}

export function LocationMonitorMap({
  points,
  simplifiedPoints = [],
  repeatedGroups = [],
  geofence = null,
  focusedPointId = null,
  className = '',
}: {
  points: LocationMonitorMapPoint[]
  simplifiedPoints?: LocationMonitorMapPoint[]
  repeatedGroups?: LocationMonitorRepeatedPoint[]
  geofence?: LocationMonitorGeofence | null
  focusedPointId?: string | null
  className?: string
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layerRef = useRef<L.LayerGroup | null>(null)
  const markerRef = useRef<Map<string, L.Marker>>(new Map())
  const invalidateTimerRef = useRef<number | null>(null)

  const playbackPoints = useMemo(() => buildDisplayPoints(points), [points])
  const [playIndex, setPlayIndex] = useState<number | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)

  // Yeni gun/veri gelince oynatmayi sifirla.
  useEffect(() => {
    setPlayIndex(null)
    setIsPlaying(false)
  }, [points])

  // Oynatma: belirli araliklarla bir sonraki noktaya ilerle.
  useEffect(() => {
    if (!isPlaying) return
    if (playbackPoints.length < 2) {
      setIsPlaying(false)
      return
    }
    if (playIndex == null) {
      setPlayIndex(0)
      return
    }
    if (playIndex >= playbackPoints.length - 1) {
      setIsPlaying(false)
      return
    }
    const timer = window.setTimeout(() => setPlayIndex((current) => (current == null ? 0 : current + 1)), 720)
    return () => window.clearTimeout(timer)
  }, [isPlaying, playIndex, playbackPoints.length])

  // Aktif oynatma noktasina haritayi tasi ve tooltip ac.
  useEffect(() => {
    if (playIndex == null || !mapRef.current) return
    const point = playbackPoints[playIndex]
    if (!point) return
    const marker = markerRef.current.get(point.id)
    if (!marker) return
    mapRef.current.panTo(marker.getLatLng(), { animate: true })
    marker.openTooltip()
  }, [playIndex, playbackPoints])

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return
    }
    const initial = points[0] ?? null
    const map = L.map(containerRef.current, {
      center: [initial?.lat ?? 41.015137, initial?.lon ?? 28.97953],
      zoom: 13,
      zoomControl: true,
      zoomAnimation: false,
      fadeAnimation: false,
      markerZoomAnimation: false,
    })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap katki saglayanlar',
    }).addTo(map)
    mapRef.current = map
    layerRef.current = L.layerGroup().addTo(map)

    return () => {
      if (invalidateTimerRef.current != null) {
        window.clearTimeout(invalidateTimerRef.current)
        invalidateTimerRef.current = null
      }
      if (mapRef.current) {
        mapRef.current.stop()
        mapRef.current.remove()
      }
      mapRef.current = null
      layerRef.current = null
      markerRef.current.clear()
    }
  }, [points])

  useEffect(() => {
    if (!mapRef.current || !layerRef.current) {
      return
    }

    const map = mapRef.current
    const layer = layerRef.current
    layer.clearLayers()
    markerRef.current.clear()

    const orderedPoints = buildDisplayPoints(points)
    const routePoints = buildDisplayPoints(simplifiedPoints.length ? simplifiedPoints : points)

    if (!orderedPoints.length && !(geofence?.home_lat != null && geofence?.home_lon != null)) {
      return
    }

    const bounds = L.latLngBounds([])
    const pathLatLngs: L.LatLngExpression[] = []

    if (geofence?.home_lat != null && geofence?.home_lon != null) {
      const geofenceCenter: L.LatLngExpression = [geofence.home_lat, geofence.home_lon]
      bounds.extend(geofenceCenter)
      if (geofence.radius_m != null && geofence.radius_m > 0) {
        L.circle(geofenceCenter, {
          radius: geofence.radius_m,
          color: geofence.status === 'OUTSIDE' ? '#f97316' : '#0f766e',
          opacity: 0.55,
          dashArray: '6 6',
          weight: 2,
          fillColor: geofence.status === 'OUTSIDE' ? '#fdba74' : '#99f6e4',
          fillOpacity: 0.08,
        }).addTo(layer)
      }
      L.circleMarker(geofenceCenter, {
        radius: 4,
        color: '#0f172a',
        fillColor: '#f8fafc',
        fillOpacity: 0.9,
        weight: 2,
      })
        .bindPopup('<strong>Geofence merkezi</strong>')
        .addTo(layer)
    }

    for (const group of repeatedGroups) {
      const groupLatLng: L.LatLngExpression = [group.lat, group.lon]
      bounds.extend(groupLatLng)
      L.circle(groupLatLng, {
        radius: Math.max(18, group.dwell_minutes * 2.5),
        color: '#7c3aed',
        opacity: 0.28,
        weight: 1.5,
        fillColor: '#a78bfa',
        fillOpacity: 0.08,
      })
        .bindPopup(
          `<strong>${group.label}</strong><br/>Bekleme: ${group.dwell_minutes} dk<br/>Tekrar: ${group.point_count} nokta`,
        )
        .addTo(layer)
    }

    for (const point of routePoints) {
      pathLatLngs.push([point.lat, point.lon])
      bounds.extend([point.lat, point.lon])
    }

    if (pathLatLngs.length > 1) {
      L.polyline(pathLatLngs, {
        color: '#0f172a',
        opacity: 0.22,
        weight: 6,
      }).addTo(layer)
      L.polyline(pathLatLngs, {
        color: '#0ea5e9',
        opacity: 0.78,
        weight: 3.25,
      }).addTo(layer)
    }

    const highlightedPoint = orderedPoints.find((point) => point.id === focusedPointId) ?? orderedPoints[orderedPoints.length - 1] ?? null
    const lastIndex = orderedPoints.length - 1

    // Ayni konumda ust uste binen noktalari kucuk bir daire seklinde yay ki
    // her numarali pin okunabilsin (ofiste giris/cikis ayni koordinat olabilir).
    const coordKey = (item: LocationMonitorMapPoint) => `${item.lat.toFixed(5)},${item.lon.toFixed(5)}`
    const coordTotals = new Map<string, number>()
    for (const point of orderedPoints) {
      coordTotals.set(coordKey(point), (coordTotals.get(coordKey(point)) ?? 0) + 1)
    }
    const coordSeen = new Map<string, number>()

    orderedPoints.forEach((point, index) => {
      const isFocused = highlightedPoint?.id === point.id
      const key = coordKey(point)
      const total = coordTotals.get(key) ?? 1
      const seenIndex = coordSeen.get(key) ?? 0
      coordSeen.set(key, seenIndex + 1)

      let displayLat = point.lat
      let displayLon = point.lon
      if (total > 1) {
        const ring = Math.floor(seenIndex / 8)
        const radiusDeg = 0.00011 + ring * 0.00009
        const angle = (2 * Math.PI * (seenIndex % 8)) / Math.min(total, 8)
        const lonScale = Math.max(0.2, Math.cos((point.lat * Math.PI) / 180))
        displayLat = point.lat + radiusDeg * Math.cos(angle)
        displayLon = point.lon + (radiusDeg / lonScale) * Math.sin(angle)
        bounds.extend([displayLat, displayLon])
        // Yayilan pini gercek konuma ince cizgiyle bagla.
        L.polyline(
          [
            [point.lat, point.lon],
            [displayLat, displayLon],
          ],
          { color: '#94a3b8', weight: 1, opacity: 0.55, dashArray: '2 3', interactive: false },
        ).addTo(layer)
      }

      const seqLabel = index === 0 ? 'İlk' : index === lastIndex ? 'Son' : `#${index + 1}`
      const marker = L.marker([displayLat, displayLon], {
        icon: numberedIcon(index + 1, point, isFocused, index === 0, index === lastIndex),
        keyboard: false,
        zIndexOffset: index === 0 || index === lastIndex ? 1000 : isFocused ? 800 : 0,
      })
        .bindTooltip(`${seqLabel} · ${pointClock(point.ts_utc)} · ${pointSourceLabel(point.source)}`, {
          direction: 'top',
          offset: [0, -16],
          opacity: 0.95,
        })
        .bindPopup(pointPopup(point))
        .addTo(layer)

      if (isFocused && point.accuracy_m != null && point.accuracy_m > 0) {
        L.circle([point.lat, point.lon], {
          radius: point.accuracy_m,
          color: '#38bdf8',
          opacity: 0.28,
          weight: 1.5,
          fillColor: '#7dd3fc',
          fillOpacity: 0.08,
        }).addTo(layer)
      }

      markerRef.current.set(point.id, marker)
    })

    if (bounds.isValid()) {
      map.fitBounds(bounds, {
        padding: [28, 28],
        maxZoom: orderedPoints.length <= 1 ? 17 : 16,
        animate: false,
      })
    }

    if (highlightedPoint) {
      map.setView([highlightedPoint.lat, highlightedPoint.lon], Math.max(map.getZoom(), 15.5), { animate: false })
    }

    if (invalidateTimerRef.current != null) {
      window.clearTimeout(invalidateTimerRef.current)
    }
    invalidateTimerRef.current = window.setTimeout(() => {
      map.invalidateSize(false)
      invalidateTimerRef.current = null
    }, 90)
  }, [focusedPointId, geofence, points, repeatedGroups, simplifiedPoints])

  useEffect(() => {
    if (!focusedPointId || !mapRef.current) {
      return
    }
    const marker = markerRef.current.get(focusedPointId)
    if (!marker) {
      return
    }
    mapRef.current.setView(marker.getLatLng(), Math.max(mapRef.current.getZoom(), 16), { animate: false })
    marker.openPopup()
  }, [focusedPointId, points])

  const totalPlaybackPoints = playbackPoints.length
  const activeIndex = playIndex ?? 0
  const activePoint = playbackPoints[activeIndex] ?? null

  const togglePlay = () => {
    if (isPlaying) {
      setIsPlaying(false)
      return
    }
    if (playIndex == null || playIndex >= totalPlaybackPoints - 1) {
      setPlayIndex(0)
    }
    setIsPlaying(true)
  }

  const stepPlayback = (delta: number) => {
    setIsPlaying(false)
    setPlayIndex((current) => {
      const base = current ?? 0
      return Math.max(0, Math.min(totalPlaybackPoints - 1, base + delta))
    })
  }

  return (
    <div className="cr-route-playback-wrap">
      <div
        ref={containerRef}
        className={`w-full rounded-2xl border border-slate-200 bg-slate-100 ${className || 'h-[33rem]'}`}
      />
      {totalPlaybackPoints > 1 ? (
        <div className="cr-route-playback" role="group" aria-label="Rota oynatma">
          <button
            type="button"
            className="cr-route-playback__btn is-primary"
            onClick={togglePlay}
            aria-label={isPlaying ? 'Duraklat' : 'Oynat'}
          >
            {isPlaying ? '⏸' : '▶'}
          </button>
          <button type="button" className="cr-route-playback__btn" onClick={() => stepPlayback(-1)} aria-label="Önceki nokta">
            ◀
          </button>
          <input
            type="range"
            className="cr-route-playback__range"
            min={0}
            max={totalPlaybackPoints - 1}
            value={activeIndex}
            onChange={(event) => {
              setIsPlaying(false)
              setPlayIndex(Number(event.target.value))
            }}
            aria-label="Rota zaman çizelgesi"
          />
          <button type="button" className="cr-route-playback__btn" onClick={() => stepPlayback(1)} aria-label="Sonraki nokta">
            ▶
          </button>
          <span className="cr-route-playback__label">
            {playIndex == null ? `${totalPlaybackPoints} nokta` : `#${activeIndex + 1}/${totalPlaybackPoints}`}
            {activePoint ? ` · ${pointClock(activePoint.ts_utc)}` : ''}
          </span>
        </div>
      ) : null}
    </div>
  )
}
