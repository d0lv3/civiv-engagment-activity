import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, isConfigured, EVENT_TITLE } from '../lib/supabase'
import { useSession } from '../lib/useSession'
import { getParticipantId, getMyWord, setMyWord, clearMyWord } from '../lib/participant'
import { validateWord } from '../lib/words'
import SetupNotice from '../components/SetupNotice'

export default function Participate() {
  const { words, settings, loading, error, refresh } = useSession()
  const [draft, setDraft] = useState('')
  const [formError, setFormError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [cached, setCached] = useState(() => getMyWord())
  const [justSubmitted, setJustSubmitted] = useState(false)
  const inputRef = useRef(null)

  const participantId = useMemo(() => getParticipantId(), [])

  // The server is the truth. localStorage only survives the refresh.
  const myWord = useMemo(() => {
    if (!cached) return null
    return words.find((w) => w.id === cached.id) || null
  }, [words, cached])

  // If the admin deleted this student's word, let them submit again.
  useEffect(() => {
    if (!loading && cached && words.length >= 0 && !words.some((w) => w.id === cached.id)) {
      // Only forget it once we have actually seen a successful load.
      if (!error) {
        clearMyWord()
        setCached(null)
        setJustSubmitted(false)
      }
    }
  }, [words, cached, loading, error])

  useEffect(() => {
    if (!cached && !loading && settings.submissions_open) inputRef.current?.focus()
  }, [cached, loading, settings.submissions_open])

  if (!isConfigured) return <SetupNotice />

  async function handleSubmit(event) {
    event.preventDefault()
    setFormError(null)

    const check = validateWord(draft)
    if (!check.ok) {
      setFormError(check.error)
      return
    }

    setBusy(true)
    try {
      const { data, error: insertError } = await supabase
        .from('words')
        .insert({ text: check.text, participant_id: participantId })
        .select()
        .single()

      if (insertError) {
        // 23505 = this phone already submitted; adopt the existing row.
        if (insertError.code === '23505') {
          const { data: existing } = await supabase
            .from('words')
            .select('*')
            .eq('participant_id', participantId)
            .maybeSingle()
          if (existing) {
            setMyWord(existing)
            setCached(existing)
            await refresh()
            return
          }
        }
        if (insertError.code === '42501') {
          setFormError('Submissions are closed right now.')
          return
        }
        throw insertError
      }

      setMyWord(data)
      setCached(data)
      setJustSubmitted(true)
      setDraft('')
      await refresh()
    } catch (err) {
      setFormError(err.message || 'Could not send your word. Try again.')
    } finally {
      setBusy(false)
    }
  }

  async function toggleHand() {
    if (!myWord || !settings.speaking_enabled) return
    const next = !myWord.is_speaking
    setBusy(true)
    try {
      const { error: updateError } = await supabase
        .from('words')
        .update({ is_speaking: next })
        .eq('id', myWord.id)
      if (updateError) throw updateError
      await refresh()
    } catch (err) {
      setFormError(err.message || 'Could not update. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const total = words.length
  const speaking = myWord?.is_speaking

  return (
    <main className="phone">
      <header className="phone__head">
        <span className="phone__kicker">Civic Engagement</span>
        <h1 className="phone__title">{EVENT_TITLE}</h1>
      </header>

      {loading && !cached ? (
        <div className="phone__card phone__card--quiet">
          <span className="spinner" aria-hidden="true" />
          <p>Connecting to the board…</p>
        </div>
      ) : myWord ? (
        <>
          <section className={'phone__card word-card' + (speaking ? ' is-speaking' : '')}>
            <span className="word-card__label">
              {justSubmitted ? 'Your word is on the board' : 'Your word'}
            </span>
            <strong className="word-card__word">{myWord.text}</strong>
            <p className="word-card__note">
              This is locked in. Ask the presenter if you need it changed.
            </p>
          </section>

          <section className="phone__card">
            <button
              type="button"
              className={'btn btn--speak' + (speaking ? ' is-active' : '')}
              onClick={toggleHand}
              disabled={!settings.speaking_enabled || busy}
            >
              {speaking ? 'Lower my hand' : 'Speak'}
            </button>

            <p className="phone__hint">
              {!settings.speaking_enabled ? (
                <>
                  <span className="dot dot--idle" aria-hidden="true" />
                  Speaking is locked. The presenter will open it soon.
                </>
              ) : speaking ? (
                <>
                  <span className="dot dot--live" aria-hidden="true" />
                  Your word is highlighted in blue on the big screen.
                </>
              ) : (
                <>
                  <span className="dot dot--open" aria-hidden="true" />
                  Speaking is open — tap to raise your hand.
                </>
              )}
            </p>
          </section>
        </>
      ) : settings.submissions_open ? (
        <form className="phone__card" onSubmit={handleSubmit}>
          <label className="phone__label" htmlFor="word">
            One word for a problem in your community
          </label>
          <input
            id="word"
            ref={inputRef}
            className="phone__input"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value)
              if (formError) setFormError(null)
            }}
            placeholder="pollution"
            maxLength={32}
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck="false"
            enterKeyHint="send"
            disabled={busy}
          />
          <p className="phone__counter">
            {draft.trim().length}/32 · one word only
          </p>

          {formError && <p className="phone__error">{formError}</p>}

          <button type="submit" className="btn btn--primary" disabled={busy || !draft.trim()}>
            {busy ? 'Sending…' : 'Add to the cloud'}
          </button>
        </form>
      ) : (
        <section className="phone__card phone__card--quiet">
          <h2 className="phone__closed">Submissions are closed</h2>
          <p>The presenter has stopped taking new words for now.</p>
        </section>
      )}

      <footer className="phone__foot">
        <span className="phone__tally">
          <strong>{total}</strong> {total === 1 ? 'voice' : 'voices'} on the board
        </span>
        <Link className="phone__link" to="/cloud">
          View the board
        </Link>
      </footer>

      {error && <p className="phone__offline">Reconnecting…</p>}
    </main>
  )
}
