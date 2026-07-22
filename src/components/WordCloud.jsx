import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { layoutCloud } from '../lib/layout'

/**
 * The cloud. White canvas, black words, blue for whoever is speaking.
 *
 * Each word is two elements: an outer node that owns the position (and
 * transitions it, so a reflow glides instead of snapping) and an inner node
 * that owns the tilt and the scale. Splitting them keeps the entry animation
 * from fighting the movement transition.
 */
export default function WordCloud({ tokens, emptyHint }) {
  const containerRef = useRef(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [fontsReady, setFontsReady] = useState(() => Boolean(document.fonts?.status === 'loaded'))
  const hasPainted = useRef(false)

  // Words are measured on a canvas. Measuring before Inter has downloaded
  // gives fallback metrics and the cloud lays out slightly wrong, so redo it
  // once the real font is in.
  useEffect(() => {
    if (fontsReady || !document.fonts) return
    let alive = true
    document.fonts.ready.then(() => {
      if (alive) setFontsReady(true)
    })
    return () => {
      alive = false
    }
  }, [fontsReady])

  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return

    const apply = () => {
      const rect = el.getBoundingClientRect()
      setSize((prev) =>
        Math.abs(prev.width - rect.width) < 1 && Math.abs(prev.height - rect.height) < 1
          ? prev
          : { width: rect.width, height: rect.height },
      )
    }

    apply()

    // ResizeObserver covers panel/layout changes. The window listeners cover
    // going fullscreen on the projector and phones being rotated — belt and
    // braces, because a cloud laid out for the wrong canvas overflows the
    // screen in front of a room.
    const observer = new ResizeObserver(apply)
    observer.observe(el)
    window.addEventListener('resize', apply)
    window.addEventListener('orientationchange', apply)
    document.addEventListener('fullscreenchange', apply)

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', apply)
      window.removeEventListener('orientationchange', apply)
      document.removeEventListener('fullscreenchange', apply)
    }
  }, [])

  // Re-run the layout only when the words or the container actually changed —
  // not when a hand goes up.
  const signature = useMemo(() => tokens.map((t) => `${t.key}:${t.count}`).join('|'), [tokens])

  const placed = useMemo(
    () => layoutCloud(tokens, size),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [signature, size.width, size.height, fontsReady],
  )

  // Stagger the very first paint for effect; after that a new word should
  // land the instant the student sends it.
  const stagger = !hasPainted.current
  useEffect(() => {
    if (placed.length) hasPainted.current = true
  }, [placed])

  return (
    <div className="cloud" ref={containerRef}>
      <div className="cloud__wash" aria-hidden="true" />

      {tokens.length === 0 && (
        <div className="cloud__empty">
          <div className="cloud__pulse" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <p>{emptyHint || 'Waiting for the first voice…'}</p>
        </div>
      )}

      {placed.map((item) => (
        <span
          key={item.key}
          className={'cloud__word' + (item.speaking ? ' is-speaking' : '')}
          style={{
            transform: `translate3d(${item.x}px, ${item.y}px, 0)`,
            zIndex: item.speaking ? 20 : 1,
          }}
        >
          <span
            className="cloud__inner"
            style={{
              fontSize: `${item.fontSize}px`,
              fontWeight: item.weight,
              '--tilt': `${item.rotation}deg`,
              '--delay': stagger ? `${Math.min(item.rank * 30, 500)}ms` : '0ms',
            }}
            title={item.count > 1 ? `${item.text} — ${item.count} students` : item.text}
          >
            {item.text}
            {item.count > 1 && <i className="cloud__count">{item.count}</i>}
          </span>
        </span>
      ))}
    </div>
  )
}
