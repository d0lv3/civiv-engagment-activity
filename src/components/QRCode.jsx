import { useEffect, useRef } from 'react'
import QRCodeLib from 'qrcode'

/**
 * Renders `value` as a QR code.
 *
 * `size` is the bitmap resolution, `display` the size it is drawn at — render
 * bigger than you show and the code stays sharp on a projector. The library
 * writes its own inline width/height onto the canvas, which would otherwise
 * beat any stylesheet, so the display size is set here afterwards.
 */
export default function QRCode({ value, size = 220, display, className }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !value) return
    QRCodeLib.toCanvas(canvas, value, {
      width: size,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#0a0a0b', light: '#ffffff' },
    })
      .then(() => {
        const px = display || size
        canvas.style.width = `${px}px`
        canvas.style.height = `${px}px`
      })
      .catch(() => {
        /* nothing sensible to do on a projector — the URL is shown underneath */
      })
  }, [value, size, display])

  return <canvas ref={canvasRef} className={className} aria-label={`QR code for ${value}`} />
}

/** The URL students should land on, derived from wherever this page is served. */
export function participantUrl() {
  const { origin, pathname } = window.location
  return `${origin}${pathname}#/`
}
