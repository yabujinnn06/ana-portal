export interface CurrentLocation {
  lat: number
  lon: number
  accuracy_m: number
}

export interface LocationFetchResult {
  location: CurrentLocation | null
  warning: string | null
}

const LAST_KNOWN_LOCATION_STORAGE = 'employee_last_known_location'

export function cacheCurrentLocation(location: CurrentLocation | null): void {
  if (typeof window === 'undefined') {
    return
  }
  if (!location) {
    window.sessionStorage.removeItem(LAST_KNOWN_LOCATION_STORAGE)
    return
  }
  window.sessionStorage.setItem(LAST_KNOWN_LOCATION_STORAGE, JSON.stringify(location))
}

export function getCachedLocation(): CurrentLocation | null {
  if (typeof window === 'undefined') {
    return null
  }
  const raw = window.sessionStorage.getItem(LAST_KNOWN_LOCATION_STORAGE)
  if (!raw) {
    return null
  }
  try {
    const parsed = JSON.parse(raw) as Partial<CurrentLocation>
    if (
      typeof parsed.lat === 'number' &&
      typeof parsed.lon === 'number' &&
      typeof parsed.accuracy_m === 'number'
    ) {
      return {
        lat: parsed.lat,
        lon: parsed.lon,
        accuracy_m: parsed.accuracy_m,
      }
    }
  } catch {
    window.sessionStorage.removeItem(LAST_KNOWN_LOCATION_STORAGE)
  }
  return null
}

export async function getCurrentLocation(timeoutMs = 15000): Promise<LocationFetchResult> {
  if (!navigator.geolocation) {
    return {
      location: null,
      warning: 'Bu cihazda konum desteği yok. Kayıt konum bilgisi olmadan gönderildi.',
    }
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const location = {
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          accuracy_m: pos.coords.accuracy,
        }
        cacheCurrentLocation(location)
        resolve({
          location,
          warning: null,
        })
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          resolve({
            location: null,
            warning: 'Konum izni verilmedi. Kayıt konum bilgisi olmadan gönderildi.',
          })
          return
        }
        if (error.code === error.TIMEOUT) {
          resolve({
            location: null,
            warning:
              'Konum tespiti zaman aşımına uğradı. Açık alana geçip tekrar deneyin (iPhone: Ayarlar > Gizlilik ve Güvenlik > Konum Servisleri > Safari için "Tam Konum" açık olmalı).',
          })
          return
        }
        resolve({
          location: null,
          warning:
            'Konum alınamadı. Telefon konumunu (GPS) açıp tekrar deneyin (iPhone: Ayarlar > Gizlilik ve Güvenlik > Konum Servisleri > Safari için "Tam Konum" açık olmalı).',
        })
      },
      {
        enableHighAccuracy: true,
        timeout: timeoutMs,
        maximumAge: 10000,
      },
    )
  })
}

export interface WatchedLocation {
  lat: number
  lon: number
  accuracy_m: number
  speed_mps: number | null
  heading_deg: number | null
  altitude_m: number | null
}

// Tek atimlik konum okumasi: surekli watchPosition yerine periyodik ping icin.
// Surekli watch iOS'ta GPS cipini acik tutup isinma/termal kisitlamaya yol aciyordu.
export async function getWatchedLocationOnce(timeoutMs = 20000): Promise<WatchedLocation | null> {
  if (!navigator.geolocation) {
    return null
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const location = {
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          accuracy_m: pos.coords.accuracy,
          speed_mps: pos.coords.speed,
          heading_deg: pos.coords.heading,
          altitude_m: pos.coords.altitude,
        }
        cacheCurrentLocation({
          lat: location.lat,
          lon: location.lon,
          accuracy_m: location.accuracy_m,
        })
        resolve(location)
      },
      () => {
        // best effort, ignore errors (permission denied / unavailable / timeout)
        resolve(null)
      },
      {
        enableHighAccuracy: true,
        maximumAge: 15000,
        timeout: timeoutMs,
      },
    )
  })
}

export async function getDeviceTelemetry(): Promise<{
  battery_level: number | null
  network_type: string | null
}> {
  let batteryLevel: number | null = null
  try {
    const getBattery = (navigator as { getBattery?: () => Promise<{ level: number }> }).getBattery
    if (getBattery) {
      const battery = await getBattery()
      batteryLevel = Math.round(battery.level * 100)
    }
  } catch {
    batteryLevel = null
  }

  let networkType: string | null = null
  try {
    const connection = (navigator as { connection?: { effectiveType?: string } }).connection
    networkType = connection?.effectiveType ?? null
  } catch {
    networkType = null
  }

  return {
    battery_level: batteryLevel,
    network_type: networkType,
  }
}
