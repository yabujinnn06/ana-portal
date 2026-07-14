import { useEffect, useRef } from 'react'

/**
 * Ambient animated background for the login screen: slow-rotating geometric
 * outlines drawn on a full-screen canvas. Pure canvas 2D, no dependencies,
 * respects prefers-reduced-motion, and cleans itself up on unmount.
 */
export function LoginCanvasBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) {
      return
    }

    const reduceMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2))

    let width = 0
    let height = 0
    let animationFrameId = 0
    let resizeTimer: number | undefined

    interface Shape {
      points: Array<{ x: number; y: number }>
      x: number
      y: number
      rotation: number
      spin: number
      alpha: number
      lineWidth: number
      color: string
    }

    let shapes: Shape[] = []

    function buildShapes() {
      shapes = []
      const count = width < 760 ? 11 : 18
      for (let i = 0; i < count; i += 1) {
        const vertexCount = 3 + Math.floor(Math.random() * 4)
        const radius = (width < 760 ? 46 : 80) + Math.random() * (width < 760 ? 90 : 180)
        const points: Array<{ x: number; y: number }> = []
        for (let v = 0; v < vertexCount; v += 1) {
          const angle = (v / vertexCount) * Math.PI * 2 + Math.random() * 0.5
          const r = radius * (0.68 + Math.random() * 0.42)
          points.push({ x: Math.cos(angle) * r, y: Math.sin(angle) * r })
        }
        shapes.push({
          points,
          x: Math.random() * width,
          y: Math.random() * height,
          rotation: Math.random() * Math.PI * 2,
          spin: (Math.random() < 0.5 ? -1 : 1) * (0.0005 + Math.random() * 0.0014),
          alpha: 0.06 + Math.random() * 0.16,
          lineWidth: Math.random() < 0.5 ? 1.5 : 2,
          color: Math.random() < 0.4 ? '125, 211, 252' : '255, 255, 255',
        })
      }
    }

    function draw() {
      if (!ctx) {
        return
      }
      ctx.clearRect(0, 0, width, height)
      for (const shape of shapes) {
        ctx.save()
        ctx.translate(shape.x, shape.y)
        ctx.rotate(shape.rotation)
        ctx.beginPath()
        ctx.moveTo(shape.points[0].x, shape.points[0].y)
        for (let p = 1; p < shape.points.length; p += 1) {
          ctx.lineTo(shape.points[p].x, shape.points[p].y)
        }
        ctx.closePath()
        ctx.strokeStyle = `rgba(${shape.color}, ${shape.alpha})`
        ctx.lineWidth = shape.lineWidth
        ctx.stroke()
        ctx.restore()
      }
    }

    function resize() {
      if (!canvas) {
        return
      }
      width = canvas.clientWidth || window.innerWidth
      height = canvas.clientHeight || window.innerHeight
      canvas.width = Math.floor(width * dpr)
      canvas.height = Math.floor(height * dpr)
      ctx?.setTransform(dpr, 0, 0, dpr, 0, 0)
      buildShapes()
      if (reduceMotion) {
        draw()
      }
    }

    function frame() {
      for (const shape of shapes) {
        shape.rotation += shape.spin
      }
      draw()
      animationFrameId = window.requestAnimationFrame(frame)
    }

    function onResize() {
      if (resizeTimer) {
        window.clearTimeout(resizeTimer)
      }
      resizeTimer = window.setTimeout(resize, 150)
    }

    resize()
    window.addEventListener('resize', onResize)
    if (!reduceMotion) {
      animationFrameId = window.requestAnimationFrame(frame)
    }

    return () => {
      window.removeEventListener('resize', onResize)
      if (resizeTimer) {
        window.clearTimeout(resizeTimer)
      }
      if (animationFrameId) {
        window.cancelAnimationFrame(animationFrameId)
      }
    }
  }, [])

  return <canvas ref={canvasRef} className="admin-login-canvas" aria-hidden="true" />
}
