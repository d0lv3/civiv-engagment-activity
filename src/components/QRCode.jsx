import { useEffect, useRef } from 'react'
import QRCodeLib from 'qrcode'

/** Renders `value` as a crisp QR code on a canvas. */
export default function QRCode({ value, size = 220, className }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !value) return
    QRCodeLib.toCanvas(canvas, value, {
      width: size,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#0a0a0b', light: '#ffffff' },
    }).catch(() => {
      /* nothing sensible to do on a projector — the URL is shown underneath */
    })
  }, [value, size])

  return <canvas ref={canvasRef} className={className} aria-label={`QR code for ${value}`} />
}

/** The URL students should land on, derived from wherever this page is served. */
export function participantUrl() {
  const { origin, pathname } = window.location
  return `${origin}${pathname}#/`
}
