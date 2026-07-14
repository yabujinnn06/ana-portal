import QRCode from 'qrcode'

// Themed QR renderer matching the admin "brand" (petrol/teal) palette.
// IMPORTANT: only the visual rendering is branded. The encoded payload is the
// raw code_value, unchanged, so codes printed before this change keep scanning.
// Error correction is forced to 'H' (30%) so the centered brand badge never
// pushes the symbol below the scannable threshold.

const BRAND_DOT = '#0c4353' // brand-800, data modules
const BRAND_EYE = '#0f5e72' // brand-600, finder eyes + center badge
const BADGE_MARK = '#eafbff' // near-white "Y"
const LIGHT = '#ffffff'

// Filled "Y" glyph from public/admin-logo.svg (viewBox 0 0 192 192).
const Y_PATH =
  'M61 38C65.8 38 70.2 40.2 73.2 44.1L96 74.8L118.8 44.1C121.8 40.2 126.2 38 131 38' +
  'C140.8 38 146.4 49.2 140.5 57L106 102.6V149C106 153.4 102.4 157 98 157H94' +
  'C89.6 157 86 153.4 86 149V102.6L51.5 57C45.6 49.2 51.2 38 61 38Z'

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}

function drawEye(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  ctx.fillStyle = BRAND_EYE
  roundRect(ctx, x, y, 7 * s, 7 * s, 7 * s * 0.3)
  ctx.fill()
  ctx.fillStyle = LIGHT
  roundRect(ctx, x + s, y + s, 5 * s, 5 * s, 5 * s * 0.28)
  ctx.fill()
  ctx.fillStyle = BRAND_EYE
  roundRect(ctx, x + 2 * s, y + 2 * s, 3 * s, 3 * s, 3 * s * 0.34)
  ctx.fill()
}

function drawBadge(ctx: CanvasRenderingContext2D, px: number): void {
  const b = px * 0.2
  const cx = px / 2
  const cy = px / 2
  const halo = px * 0.014
  ctx.fillStyle = LIGHT
  roundRect(ctx, cx - b / 2 - halo, cy - b / 2 - halo, b + halo * 2, b + halo * 2, b * 0.3)
  ctx.fill()
  ctx.fillStyle = BRAND_EYE
  roundRect(ctx, cx - b / 2, cy - b / 2, b, b, b * 0.28)
  ctx.fill()
  const scale = (b * 0.62) / 192
  ctx.save()
  ctx.translate(cx - 96 * scale, cy - 96 * scale)
  ctx.scale(scale, scale)
  ctx.fillStyle = BADGE_MARK
  ctx.fill(new Path2D(Y_PATH))
  ctx.restore()
}

export function renderBrandedQrDataUrl(payload: string, size = 512): string {
  const qr = QRCode.create(payload, { errorCorrectionLevel: 'H' })
  const count = qr.modules.size
  const get = (r: number, c: number): boolean =>
    r >= 0 && c >= 0 && r < count && c < count && qr.modules.get(r, c) === 1

  const quiet = 4
  const total = count + quiet * 2
  const cell = Math.max(2, Math.floor(size / total))
  const px = total * cell
  const off = quiet * cell

  const canvas = document.createElement('canvas')
  canvas.width = px
  canvas.height = px
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    return ''
  }

  ctx.fillStyle = LIGHT
  ctx.fillRect(0, 0, px, px)

  const inFinder = (r: number, c: number): boolean =>
    (r < 7 && c < 7) || (r < 7 && c >= count - 7) || (r >= count - 7 && c < 7)

  ctx.fillStyle = BRAND_DOT
  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (!get(r, c) || inFinder(r, c)) {
        continue
      }
      roundRect(ctx, off + c * cell, off + r * cell, cell, cell, cell * 0.35)
      ctx.fill()
    }
  }

  drawEye(ctx, off, off, cell)
  drawEye(ctx, off + (count - 7) * cell, off, cell)
  drawEye(ctx, off, off + (count - 7) * cell, cell)

  drawBadge(ctx, px)

  return canvas.toDataURL('image/png')
}
