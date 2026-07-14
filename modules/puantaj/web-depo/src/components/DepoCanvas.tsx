import { useEffect, useRef } from "react";

// Gelismis login arka plani: canvas ile 3B perspektif depo koridoru.
// Icinden suzulen raf baylari + koliler (derinlik sisi), tavan lambalari + isik
// havuzlari/konileri, koridorda yaklasan forklift, sayim yesili pulse'lari,
// toz partikulleri, pointer parallax. Bagimlilik yok (2D canvas).
export default function DepoCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let W = 0, H = 0, dpr = 1;
    const ptr = { x: 0, y: 0, tx: 0, ty: 0 };
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

    function resize() {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = canvas!.clientWidth; H = canvas!.clientHeight;
      canvas!.width = Math.max(1, Math.round(W * dpr));
      canvas!.height = Math.max(1, Math.round(H * dpr));
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    function onMove(e: PointerEvent) {
      ptr.tx = (e.clientX / window.innerWidth) * 2 - 1;
      ptr.ty = (e.clientY / window.innerHeight) * 2 - 1;
    }
    window.addEventListener("pointermove", onMove);

    // dunya
    const FLOOR_Y = -2.1, CEIL_Y = 3.3, RACK_X = 3.05;
    const BAY = 3.0, Z_NEAR = 3.6, Z_FAR = 30;
    const LEVELS = [-1.5, -0.6, 0.3, 1.2];
    const SHELF_Y = LEVELS.map((y) => y - 0.36);
    const VISIBLE = Math.ceil((Z_FAR - Z_NEAR) / BAY) + 1;
    const NAVY = [10, 26, 44];
    const BOX = [[191, 111, 52], [168, 92, 42], [61, 90, 116], [82, 120, 155], [201, 166, 89], [107, 142, 158]];

    const hash = (n: number) => { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); };
    const dust = Array.from({ length: 70 }, (_, i) => ({
      x: (hash(i * 3.1) - 0.5) * 6, y: (hash(i * 7.7) - 0.3) * 5,
      z0: Z_NEAR + hash(i * 1.7) * (Z_FAR - Z_NEAR), ph: hash(i * 9.3) * 6.28, sp: 0.4 + hash(i * 5.5) * 0.7,
    }));

    const t0 = performance.now();

    function frame(now: number) {
      const ctx2 = ctx!;
      const t = (now - t0) / 1000;
      ptr.x += (ptr.tx - ptr.x) * 0.05;
      ptr.y += (ptr.ty - ptr.y) * 0.05;
      const cx = W / 2 - ptr.x * 26;
      const cy = H * 0.44 - ptr.y * 16 + Math.sin(t * 0.4) * 4;
      const f = H * 0.62;
      const speed = reduce ? 0.25 : 1.15;
      const scroll = (t * speed) % BAY;
      const baseIdx = Math.floor((t * speed) / BAY);

      const proj = (X: number, Y: number, Z: number) => ({ sx: cx + (X / Z) * f, sy: cy - (Y / Z) * f, s: f / Z });
      const fog = (Z: number) => Math.min(1, Math.max(0, (Z - Z_NEAR) / (Z_FAR - Z_NEAR)));
      const col = (rgb: number[], fg: number, mul: number) => {
        const r = rgb[0] * mul + (NAVY[0] - rgb[0] * mul) * fg;
        const g = rgb[1] * mul + (NAVY[1] - rgb[1] * mul) * fg;
        const b = rgb[2] * mul + (NAVY[2] - rgb[2] * mul) * fg;
        return `rgb(${r | 0},${g | 0},${b | 0})`;
      };
      const quad = (p: { sx: number; sy: number }[], color: string | CanvasGradient) => {
        ctx2.fillStyle = color;
        ctx2.beginPath();
        ctx2.moveTo(p[0].sx, p[0].sy);
        for (let i = 1; i < p.length; i++) ctx2.lineTo(p[i].sx, p[i].sy);
        ctx2.closePath(); ctx2.fill();
      };

      // arka plan + horizon glow
      const bg = ctx2.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, "#0a1a2c"); bg.addColorStop(0.5, "#0c2236"); bg.addColorStop(1, "#070f18");
      ctx2.fillStyle = bg; ctx2.fillRect(0, 0, W, H);
      const glow = ctx2.createRadialGradient(cx, cy, 0, cx, cy, H * 0.6);
      glow.addColorStop(0, "rgba(191,111,52,0.26)"); glow.addColorStop(0.4, "rgba(191,111,52,0.07)"); glow.addColorStop(1, "rgba(191,111,52,0)");
      ctx2.fillStyle = glow; ctx2.fillRect(0, 0, W, H);

      // koridor sonunda isikli sevkiyat kapisi (tunelin ucundaki isik)
      {
        const ZG = Z_FAR - 0.5;
        const gTL = proj(-1.05, 1.9, ZG), gBR = proj(1.05, FLOOR_Y, ZG);
        const gw = gBR.sx - gTL.sx, gh = gBR.sy - gTL.sy;
        const puls = 0.85 + 0.15 * Math.sin(t * 0.7);
        const gateGlow = ctx2.createRadialGradient(
          (gTL.sx + gBR.sx) / 2, (gTL.sy + gBR.sy) / 2, 0,
          (gTL.sx + gBR.sx) / 2, (gTL.sy + gBR.sy) / 2, gw * 2.4,
        );
        gateGlow.addColorStop(0, `rgba(255,190,130,${0.32 * puls})`);
        gateGlow.addColorStop(1, "rgba(255,190,130,0)");
        ctx2.fillStyle = gateGlow;
        ctx2.fillRect(gTL.sx - gw * 2, gTL.sy - gh * 2, gw * 5, gh * 5);
        const gate = ctx2.createLinearGradient(0, gTL.sy, 0, gBR.sy);
        gate.addColorStop(0, `rgba(255,205,150,${0.55 * puls})`);
        gate.addColorStop(1, `rgba(255,170,110,${0.28 * puls})`);
        ctx2.fillStyle = gate;
        ctx2.fillRect(gTL.sx, gTL.sy, gw, gh);
        // kapi dikey panjur cizgileri
        ctx2.strokeStyle = `rgba(20,35,55,${0.5 * puls})`;
        ctx2.lineWidth = 1;
        for (let gi = 1; gi < 6; gi++) {
          const gx = gTL.sx + (gw * gi) / 6;
          ctx2.beginPath(); ctx2.moveTo(gx, gTL.sy); ctx2.lineTo(gx, gBR.sy); ctx2.stroke();
        }
      }

      // tavan boyuna raylar (vanishing point'e akan cati hatlari)
      for (const rx of [-1.9, -0.65, 0.65, 1.9]) {
        const a = proj(rx, CEIL_Y, Z_NEAR), b = proj(rx, CEIL_Y, Z_FAR);
        ctx2.strokeStyle = "rgba(110,140,175,0.10)";
        ctx2.lineWidth = 1;
        ctx2.beginPath(); ctx2.moveTo(a.sx, a.sy); ctx2.lineTo(b.sx, b.sy); ctx2.stroke();
      }

      // zemin izgarasi
      ctx2.lineWidth = 1;
      for (const rx of [-RACK_X, -1.3, 0, 1.3, RACK_X]) {
        const a = proj(rx, FLOOR_Y, Z_NEAR), b = proj(rx, FLOOR_Y, Z_FAR);
        ctx2.strokeStyle = "rgba(127,179,224,0.09)";
        ctx2.beginPath(); ctx2.moveTo(a.sx, a.sy); ctx2.lineTo(b.sx, b.sy); ctx2.stroke();
      }
      for (let i = 0; i < VISIBLE + 1; i++) {
        const Z = Z_NEAR + i * BAY - scroll;
        if (Z < Z_NEAR || Z > Z_FAR) continue;
        const a = proj(-RACK_X, FLOOR_Y, Z), b = proj(RACK_X, FLOOR_Y, Z);
        ctx2.strokeStyle = `rgba(127,179,224,${0.16 * (1 - fog(Z))})`;
        ctx2.beginPath(); ctx2.moveTo(a.sx, a.sy); ctx2.lineTo(b.sx, b.sy); ctx2.stroke();
      }

      // raf yatay planklari (koridor boyunca, vanishing point'e)
      for (const side of [-1, 1]) {
        const X = side * RACK_X;
        for (const Y of SHELF_Y) {
          const a = proj(X, Y, Z_NEAR), b = proj(X, Y, Z_FAR);
          ctx2.strokeStyle = "rgba(120,150,182,0.13)"; ctx2.lineWidth = 1;
          ctx2.beginPath(); ctx2.moveTo(a.sx, a.sy); ctx2.lineTo(b.sx, b.sy); ctx2.stroke();
        }
      }

      // dunya: uzaktan yakina (painter)
      for (let i = VISIBLE; i >= 0; i--) {
        const Z = Z_NEAR + i * BAY - scroll;
        if (Z < Z_NEAR - BAY || Z > Z_FAR) continue;
        const bayId = baseIdx + i;
        const fgZ = fog(Z);

        // tavan capraz kirisi (her bay) — cati yapisi hissi
        if (Z > Z_NEAR) {
          const ka = proj(-RACK_X, CEIL_Y, Z), kb = proj(RACK_X, CEIL_Y, Z);
          ctx2.strokeStyle = `rgba(110,140,175,${0.14 * (1 - fgZ)})`;
          ctx2.lineWidth = Math.max(1, ka.s * 0.03);
          ctx2.beginPath(); ctx2.moveTo(ka.sx, ka.sy); ctx2.lineTo(kb.sx, kb.sy); ctx2.stroke();
        }

        // tavan lambasi (her 2 bayda) + isik konisi + zemin havuzu
        if (bayId % 2 === 0 && Z > Z_NEAR) {
          const flick = 0.75 + 0.25 * Math.sin(t * 9 + bayId * 2.1) * (hash(bayId) > 0.85 ? 1 : 0.25);
          const lamp = proj(0, CEIL_Y, Z);
          const fl = proj(0, FLOOR_Y, Z);
          const cone = ctx2.createLinearGradient(0, lamp.sy, 0, fl.sy);
          cone.addColorStop(0, `rgba(255,210,150,${0.20 * flick * (1 - fgZ)})`);
          cone.addColorStop(1, "rgba(255,210,150,0)");
          quad([proj(-0.18, CEIL_Y, Z), proj(0.18, CEIL_Y, Z), proj(1.5, FLOOR_Y, Z), proj(-1.5, FLOOR_Y, Z)], cone);
          const pool = ctx2.createRadialGradient(fl.sx, fl.sy, 0, fl.sx, fl.sy, lamp.s * 1.6);
          pool.addColorStop(0, `rgba(255,200,140,${0.16 * flick * (1 - fgZ)})`); pool.addColorStop(1, "rgba(255,200,140,0)");
          ctx2.fillStyle = pool; ctx2.fillRect(fl.sx - lamp.s * 1.8, fl.sy - lamp.s, lamp.s * 3.6, lamp.s * 2);
          // parlak zeminde kameraya uzanan yansima izi
          const yakinZ = Math.max(Z_NEAR + 0.2, Z - 2.6);
          const y0 = proj(0, FLOOR_Y, Z), y1 = proj(0, FLOOR_Y, yakinZ);
          const iz = ctx2.createLinearGradient(0, y0.sy, 0, y1.sy);
          iz.addColorStop(0, `rgba(255,205,150,${0.12 * flick * (1 - fgZ)})`);
          iz.addColorStop(1, "rgba(255,205,150,0)");
          quad([
            proj(-0.14, FLOOR_Y, Z), proj(0.14, FLOOR_Y, Z),
            proj(0.42, FLOOR_Y, yakinZ), proj(-0.42, FLOOR_Y, yakinZ),
          ], iz);
          ctx2.fillStyle = `rgba(255,225,170,${0.9 * flick * (1 - fgZ * 0.7)})`;
          ctx2.beginPath(); ctx2.arc(lamp.sx, lamp.sy, Math.max(1, lamp.s * 0.07), 0, 7); ctx2.fill();
        }

        // raf yapisi + koliler (DUZ on yuz, kama yok; uzak sis ile elenir)
        if (fgZ < 0.78) {
          for (const side of [-1, 1]) {
            const X = side * RACK_X;
            // dikey direk (bay on kenari) - bantlari kirar, raf gibi okunur
            const p0 = proj(X, FLOOR_Y, Z), p1 = proj(X, CEIL_Y, Z);
            ctx2.strokeStyle = `rgba(124,154,186,${0.42 * (1 - fgZ)})`;
            ctx2.lineWidth = Math.max(1, p0.s * 0.05);
            ctx2.beginPath(); ctx2.moveTo(p0.sx, p0.sy); ctx2.lineTo(p1.sx, p1.sy); ctx2.stroke();
            // koliler (her raf gozu, aralarinda bosluk + kenarlik)
            for (let li = 0; li < LEVELS.length; li++) {
              const id = bayId * 53 + li * 7 + (side + 1) * 311;
              if (hash(id) < 0.3) continue;
              const Y0 = LEVELS[li];
              const wx = 0.5, hy = 0.32;
              const Zn = Z + 0.15, Zu = Zn + 0.7; // on yuz yakinda, kutu derinligi geriye
              const rgb = BOX[Math.floor(hash(id * 1.3) * BOX.length) % BOX.length];
              const fr = [proj(X - wx, Y0 - hy, Zn), proj(X + wx, Y0 - hy, Zn), proj(X + wx, Y0 + hy, Zn), proj(X - wx, Y0 + hy, Zn)];
              // kapali kutu: goz hizasinin altindakilerde ust yuz, ustundekilerde alt yuz gorunur
              if (Y0 + hy < 0) {
                quad([proj(X - wx, Y0 + hy, Zn), proj(X + wx, Y0 + hy, Zn), proj(X + wx, Y0 + hy, Zu), proj(X - wx, Y0 + hy, Zu)], col(rgb, fgZ, 1.32));
              } else if (Y0 - hy > 0) {
                quad([proj(X - wx, Y0 - hy, Zn), proj(X + wx, Y0 - hy, Zn), proj(X + wx, Y0 - hy, Zu), proj(X - wx, Y0 - hy, Zu)], col(rgb, fgZ, 0.45));
              }
              // koridora bakan yan yuz (golgeli)
              const xi = X - side * wx;
              quad([proj(xi, Y0 - hy, Zn), proj(xi, Y0 + hy, Zn), proj(xi, Y0 + hy, Zu), proj(xi, Y0 - hy, Zu)], col(rgb, fgZ, 0.68));
              // on yuz (kameraya bakan, en son cizilir)
              quad(fr, col(rgb, fgZ, 1.0));
              // koyu kenarlik
              ctx2.strokeStyle = `rgba(6,14,24,${0.55 * (1 - fgZ)})`; ctx2.lineWidth = 1;
              ctx2.beginPath(); ctx2.moveTo(fr[0].sx, fr[0].sy);
              for (let k = 1; k < 4; k++) ctx2.lineTo(fr[k].sx, fr[k].sy);
              ctx2.closePath(); ctx2.stroke();
              // yakin kolilere barkod etiketi
              if (fgZ < 0.42 && hash(id * 4.1) < 0.55) {
                const bw = fr[1].sx - fr[0].sx;
                const bh = fr[3].sy - fr[0].sy;
                const lw = bw * 0.34, lh = bh * 0.30;
                const lx = fr[0].sx + (bw - lw) / 2;
                const ly = fr[0].sy + bh * 0.52;
                ctx2.fillStyle = `rgba(232,238,244,${0.8 * (1 - fgZ * 2)})`;
                ctx2.fillRect(lx, ly, lw, lh);
                ctx2.strokeStyle = `rgba(12,22,36,${0.85 * (1 - fgZ * 2)})`;
                ctx2.lineWidth = Math.max(0.6, bw * 0.012);
                for (let bi = 0; bi < 6; bi++) {
                  const bxp = lx + lw * (0.12 + bi * 0.15 + hash(id + bi) * 0.05);
                  ctx2.beginPath();
                  ctx2.moveTo(bxp, ly + lh * 0.15);
                  ctx2.lineTo(bxp, ly + lh * 0.85);
                  ctx2.stroke();
                }
              }
              // sayim yesili pulse
              if (hash(id * 2.7) < 0.28) {
                const g = Math.pow(Math.max(0, Math.sin(t * 1.3 - hash(id) * 6.28)), 5) * (1 - fgZ);
                if (g > 0.02) quad(fr, `rgba(95,190,122,${0.85 * g})`);
              }
            }
          }
        }
      }

      // toz (additive)
      ctx2.globalCompositeOperation = "lighter";
      for (const d of dust) {
        const Z = ((d.z0 - t * speed * d.sp - Z_NEAR) % (Z_FAR - Z_NEAR) + (Z_FAR - Z_NEAR)) % (Z_FAR - Z_NEAR) + Z_NEAR;
        const p = proj(d.x, d.y + Math.sin(t * 0.5 + d.ph) * 0.15, Z);
        const a = (1 - fog(Z)) * (0.4 + 0.4 * Math.sin(t * 1.2 + d.ph));
        if (a <= 0.02) continue;
        ctx2.fillStyle = `rgba(255,210,160,${a * 0.5})`;
        ctx2.beginPath(); ctx2.arc(p.sx, p.sy, Math.max(0.5, p.s * 0.02), 0, 7); ctx2.fill();
      }
      ctx2.globalCompositeOperation = "source-over";

      // tarama beam (yatay suzulen dikey lazer perdesi + parlak cekirdek)
      const bx = cx + Math.sin(t * 0.55) * W * 0.42;
      const beam = ctx2.createLinearGradient(bx - 44, 0, bx + 44, 0);
      beam.addColorStop(0, "rgba(191,111,52,0)"); beam.addColorStop(0.5, "rgba(255,180,120,0.13)"); beam.addColorStop(1, "rgba(191,111,52,0)");
      ctx2.fillStyle = beam; ctx2.fillRect(bx - 44, 0, 88, H);
      ctx2.globalCompositeOperation = "lighter";
      ctx2.strokeStyle = "rgba(255,200,140,0.28)";
      ctx2.lineWidth = 1.5;
      ctx2.beginPath(); ctx2.moveTo(bx, 0); ctx2.lineTo(bx, H); ctx2.stroke();
      ctx2.globalCompositeOperation = "source-over";

      // vignette
      const vg = ctx2.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.85);
      vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(4,9,16,0.7)");
      ctx2.fillStyle = vg; ctx2.fillRect(0, 0, W, H);

      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    function onVis() {
      if (document.visibilityState === "hidden") cancelAnimationFrame(raf);
      else raf = requestAnimationFrame(frame);
    }
    document.addEventListener("visibilitychange", onVis);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return <canvas ref={ref} className="absolute inset-0 z-0 h-full w-full" aria-hidden />;
}
