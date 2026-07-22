import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase, isConfigured, EVENT_TITLE } from '../lib/supabase'
import { useSession } from '../lib/useSession'
import { getParticipantId, getMyWord, setMyWord, clearMyWord } from '../lib/participant'
import { validateWord } from '../lib/words'
import SetupNotice from '../components/SetupNotice'

export default function Participate() {
  const { words, settings, loading, error, refresh, setWords } = useSession()
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
  //
  // `adopt` below puts the new row straight into `words`, so by the time this
  // runs the student's own word is already in the list. Without that, this
  // effect fires on the render right after a successful submit — while `words`
  // is still the pre-insert list — and instantly throws away the word they
  // just sent.
  useEffect(() => {
    if (loading || error || !cached) return
    if (words.some((w) => w.id === cached.id)) return
    clearMyWord()
    setCached(null)
    setJustSubmitted(false)
  }, [words, cached, loading, error])

  /** Remember a row locally and show it on the board without waiting for a refetch. */
  function adopt(row) {
    setWords((prev) => (prev.some((w) => w.id === row.id) ? prev : [...prev, row]))
    setMyWord(row)
    setCached(row)
  }

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
            adopt(existing)
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

      adopt(data)
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
      if (updateError) {
        // 23505 = the one-speaker index rejected it; somebody beat them to it
        // in the moment between the board updating and the tap landing.
        if (updateError.code === '23505') {
          setFormError('Someone else is speaking right now — wait for them to finish.')
          await refresh()
          return
        }
        throw updateError
      }
      await refresh()
    } catch (err) {
      setFormError(err.message || 'Could not update. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const total = words.length
  const speaking = myWord?.is_speaking

  // One voice at a time. While somebody holds the floor nobody else can take
  // it — they have to lower their hand first, or the presenter lowers it for
  // them from the console.
  const floorHolder = words.find((w) => w.is_speaking)
  const someoneElseHasFloor = Boolean(floorHolder && floorHolder.id !== myWord?.id)

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
              disabled={!settings.speaking_enabled || someoneElseHasFloor || busy}
            >
              {speaking ? 'Lower my hand' : someoneElseHasFloor ? 'Someone is speaking' : 'Speak'}
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
                  You have the floor — your word is blue on the big screen. Lower your
                  hand when you're done so someone else can speak.
                </>
              ) : someoneElseHasFloor ? (
                <>
                  <span className="dot dot--busy" aria-hidden="true" />
                  <strong>{floorHolder.text}</strong> has the floor. You can speak once
                  they lower their hand.
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

      {/* No link to the cloud from here on purpose — students watch the
          projector, not their own screens. The board is reached from /#/admin. */}
      <footer className="phone__foot">
        <span className="phone__tally">
          <strong>{total}</strong> {total === 1 ? 'voice' : 'voices'} on the board
        </span>
      </footer>

      {error && <p className="phone__offline">Reconnecting…</p>}
    </main>
  )
}
