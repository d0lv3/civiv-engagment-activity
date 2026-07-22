import { useCallback, useEffect, useMemo, useState } from 'react'
import { EVENT_TITLE, isConfigured } from '../lib/supabase'
import { useSession } from '../lib/useSession'
import { groupWords } from '../lib/words'
import WordCloud from '../components/WordCloud'
import QRCode, { participantUrl } from '../components/QRCode'
import SetupNotice from '../components/SetupNotice'

/**
 * The screen on the projector. Deliberately chrome-free: a title bar, the
 * cloud, and a QR panel that can be collapsed once everybody has joined.
 */
export default function CloudView() {
  const { words, settings, live } = useSession()
  const [showQR, setShowQR] = useState(true)
  const [fullscreen, setFullscreen] = useState(false)

  const tokens = useMemo(() => groupWords(words), [words])
  const url = useMemo(() => participantUrl(), [])
  const speakers = useMemo(() => tokens.filter((t) => t.speaking), [tokens])

  const toggleFullscreen = useCallback(() => {
    const el = document.documentElement
    if (!document.fullscreenElement) el.requestFullscreen?.().catch(() => {})
    else document.exitFullscreen?.().catch(() => {})
  }, [])

  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  // Handy presenter shortcuts: F = fullscreen, Q = toggle the QR panel.
  useEffect(() => {
    const onKey = (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'f' || e.key === 'F') toggleFullscreen()
      if (e.key === 'q' || e.key === 'Q') setShowQR((v) => !v)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggleFullscreen])

  if (!isConfigured) return <SetupNotice />

  return (
    <main className="stage">
      <header className="stage__bar">
        <div className="stage__identity">
          <span className="stage__kicker">Civic Engagement</span>
          <h1 className="stage__title">{EVENT_TITLE}</h1>
        </div>

        <div className="stage__meta">
          {speakers.length > 0 && (
            <span className="chip chip--speaking">
              <span className="dot dot--live" aria-hidden="true" />
              {speakers.length === 1
                ? `${speakers[0].text} wants to speak`
                : `${speakers.length} hands raised`}
            </span>
          )}
          <span className="chip">
            <strong>{words.length}</strong> {words.length === 1 ? 'voice' : 'voices'}
          </span>
          <span className={'chip chip--status' + (live ? ' is-live' : '')}>
            <span className={'dot ' + (live ? 'dot--live' : 'dot--idle')} aria-hidden="true" />
            {live ? 'Live' : 'Syncing'}
          </span>
        </div>
      </header>

      <section className="stage__canvas">
        <WordCloud
          tokens={tokens}
          emptyHint={
            settings.submissions_open
              ? 'Scan the code and send one word.'
              : 'Submissions are closed.'
          }
        />
      </section>

      <aside className={'joinbox' + (showQR ? '' : ' is-hidden')}>
        {/* rendered at 2x the displayed size so it stays crisp on the projector */}
        <QRCode value={url} size={208} display={104} className="joinbox__qr" />
        <div className="joinbox__text">
          <span className="joinbox__label">Scan to join</span>
          <code className="joinbox__url">{url.replace(/^https?:\/\//, '')}</code>
        </div>
      </aside>

      <div className="stage__controls">
        <button className="ghost" onClick={() => setShowQR((v) => !v)}>
          {showQR ? 'Hide code' : 'Show code'}
        </button>
        <button className="ghost" onClick={toggleFullscreen}>
          {fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
        </button>
      </div>
    </main>
  )
}
