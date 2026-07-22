import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, isConfigured, EVENT_TITLE } from '../lib/supabase'
import { useSession } from '../lib/useSession'
import { groupWords, validateWord } from '../lib/words'
import WordCloud from '../components/WordCloud'
import QRCode, { participantUrl } from '../components/QRCode'
import SetupNotice from '../components/SetupNotice'

export default function Admin() {
  const [session, setSession] = useState(null)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    if (!isConfigured) {
      setChecking(false)
      return
    }
    let alive = true
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return
      setSession(data.session)
      setChecking(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
    })
    return () => {
      alive = false
      sub.subscription.unsubscribe()
    }
  }, [])

  if (!isConfigured) return <SetupNotice />
  if (checking) {
    return (
      <main className="admin admin--center">
        <span className="spinner" aria-hidden="true" />
      </main>
    )
  }
  if (!session) return <Login />
  return <Console email={session.user?.email} />
}

/* ------------------------------------------------------------------ */

function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
    if (signInError) setError(signInError.message)
    setBusy(false)
  }

  return (
    <main className="admin admin--center">
      <form className="login" onSubmit={submit}>
        <span className="login__kicker">Presenter access</span>
        <h1 className="login__title">{EVENT_TITLE}</h1>
        <p className="login__sub">Sign in to run the board.</p>

        <label className="field">
          <span>Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            required
          />
        </label>

        <label className="field">
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>

        {error && <p className="phone__error">{error}</p>}

        <button className="btn btn--primary" type="submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>

        <Link className="login__back" to="/">
          ← Back to the student page
        </Link>
      </form>
    </main>
  )
}

/* ------------------------------------------------------------------ */

/**
 * Words the presenter typed in themselves carry this prefix instead of a real
 * phone's id, so they can be told apart from student submissions on the board
 * and cleared out in one go before the class starts.
 */
const TEST_PREFIX = 'admin-test-'

const isTestWord = (word) => String(word.participant_id || '').startsWith(TEST_PREFIX)

const testParticipantId = () =>
  TEST_PREFIX +
  (globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36))

/**
 * A spread with deliberate repeats, so adding it exercises the things that
 * only show up with real data: duplicate merging, the size ramp and the ink
 * ramp. A flat list of unique words would render as one uniform blob.
 */
const SAMPLE_SPREAD = [
  ['pollution', 4],
  ['unemployment', 3],
  ['traffic', 3],
  ['corruption', 2],
  ['housing', 2],
  ['water', 1],
  ['literacy', 1],
  ['waste', 1],
  ['healthcare', 1],
  ['safety', 1],
  ['poverty', 1],
  ['noise', 1],
]

function Console({ email }) {
  const { words, settings, refresh, live } = useSession()
  const [editingId, setEditingId] = useState(null)
  const [editValue, setEditValue] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  const [draft, setDraft] = useState('')

  const tokens = useMemo(() => groupWords(words), [words])
  const url = useMemo(() => participantUrl(), [])
  const raisedHands = words.filter((w) => w.is_speaking)
  const testWords = words.filter((w) => isTestWord(w))

  async function run(action) {
    setBusy(true)
    setError(null)
    try {
      const { error: actionError } = await action()
      if (actionError) throw actionError
      await refresh()
    } catch (err) {
      setError(err.message || String(err))
    } finally {
      setBusy(false)
    }
  }

  const setFlag = (patch) =>
    run(() => supabase.from('settings').update(patch).eq('id', 1))

  // Only one word may hold the floor, so handing it to somebody means taking
  // it off whoever has it. Doing that here rather than making you lower the
  // last speaker first — and it keeps us clear of the one-speaker index.
  const setSpeaking = (id, value) =>
    run(async () => {
      if (!value) {
        return supabase.from('words').update({ is_speaking: false }).eq('id', id)
      }
      const cleared = await supabase
        .from('words')
        .update({ is_speaking: false })
        .eq('is_speaking', true)
      if (cleared.error) return cleared
      return supabase.from('words').update({ is_speaking: true }).eq('id', id)
    })

  const clearHands = () =>
    run(() => supabase.from('words').update({ is_speaking: false }).eq('is_speaking', true))

  const remove = (id) => {
    if (!window.confirm('Delete this word from the board?')) return
    run(() => supabase.from('words').delete().eq('id', id))
  }

  // Adding words yourself, to try the board out before anybody is in the room.
  // These go in under a test id so they can be told apart from real
  // submissions and cleared in one go.
  async function addWord(event) {
    event.preventDefault()
    const check = validateWord(draft)
    if (!check.ok) {
      setError(check.error)
      return
    }
    await run(() =>
      supabase.from('words').insert({ text: check.text, participant_id: testParticipantId() }),
    )
    setDraft('')
  }

  const addSamples = () =>
    run(() =>
      supabase.from('words').insert(
        SAMPLE_SPREAD.flatMap(([text, times]) =>
          Array.from({ length: times }, () => ({
            text,
            participant_id: testParticipantId(),
          })),
        ),
      ),
    )

  const removeTestWords = () => {
    if (!window.confirm(`Remove ${testWords.length} test word(s)? Student words are kept.`)) return
    run(() => supabase.from('words').delete().like('participant_id', `${TEST_PREFIX}%`))
  }

  const removeAll = () => {
    if (!window.confirm(`Delete all ${words.length} words? This cannot be undone.`)) return
    run(() => supabase.from('words').delete().neq('id', '00000000-0000-0000-0000-000000000000'))
  }

  function startEdit(word) {
    setEditingId(word.id)
    setEditValue(word.text)
    setError(null)
  }

  async function saveEdit(id) {
    const check = validateWord(editValue)
    if (!check.ok) {
      setError(check.error)
      return
    }
    await run(() => supabase.from('words').update({ text: check.text }).eq('id', id))
    setEditingId(null)
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      setError('Copy failed — select the link manually.')
    }
  }

  return (
    <main className="admin">
      <header className="admin__bar">
        <div>
          <span className="admin__kicker">Presenter console</span>
          <h1 className="admin__title">{EVENT_TITLE}</h1>
        </div>
        <div className="admin__bar-right">
          <span className={'chip chip--status' + (live ? ' is-live' : '')}>
            <span className={'dot ' + (live ? 'dot--live' : 'dot--idle')} aria-hidden="true" />
            {live ? 'Live' : 'Syncing'}
          </span>
          {/* The only way into the board — the student page deliberately
              has no link to it. */}
          <a className="ghost ghost--primary" href="#/cloud" target="_blank" rel="noreferrer">
            Open the board ↗
          </a>
          <button className="ghost" onClick={() => supabase.auth.signOut()}>
            Sign out
          </button>
        </div>
      </header>

      {error && <p className="admin__error">{error}</p>}

      <div className="admin__grid">
        {/* ---- left column: controls -------------------------------- */}
        <section className="panel">
          <h2 className="panel__title">Session controls</h2>

          <Switch
            label="Submissions open"
            hint="Students can add new words."
            checked={settings.submissions_open}
            disabled={busy}
            onChange={(v) => setFlag({ submissions_open: v })}
          />

          <Switch
            label="Speaking enabled"
            hint="Unlocks the Speak button on every phone."
            checked={settings.speaking_enabled}
            disabled={busy}
            onChange={(v) => setFlag({ speaking_enabled: v })}
            accent
          />

          <div className="panel__row">
            <div>
              {raisedHands.length ? (
                <>
                  <strong>{raisedHands[0].text}</strong> has the floor
                </>
              ) : (
                <span className="panel__muted">Nobody is speaking</span>
              )}
            </div>
            <button className="ghost" onClick={clearHands} disabled={busy || !raisedHands.length}>
              Lower
            </button>
          </div>

          {raisedHands.length > 0 && (
            <ul className="hands">
              {raisedHands.map((w) => (
                <li key={w.id}>
                  <span className="hands__word">{w.text}</span>
                  <button className="linkbtn" onClick={() => setSpeaking(w.id, false)} disabled={busy}>
                    lower
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ---- middle column: join info + preview -------------------- */}
        <section className="panel panel--join">
          <h2 className="panel__title">Join link</h2>
          <QRCode value={url} size={300} display={150} className="panel__qr" />
          <code className="panel__url">{url}</code>
          <button className="ghost ghost--wide" onClick={copyLink}>
            {copied ? 'Copied ✓' : 'Copy link'}
          </button>

          <h2 className="panel__title panel__title--spaced">Live preview</h2>
          <div className="preview">
            <WordCloud tokens={tokens} emptyHint="No words yet." />
          </div>
        </section>

        {/* ---- right column: word management ------------------------- */}
        <section className="panel panel--words">
          <div className="panel__head">
            <h2 className="panel__title">Words ({words.length})</h2>
            <button className="ghost ghost--danger" onClick={removeAll} disabled={busy || !words.length}>
              Delete all
            </button>
          </div>

          <form className="addword" onSubmit={addWord}>
            <input
              className="addword__input"
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value)
                if (error) setError(null)
              }}
              placeholder="Add a word yourself…"
              maxLength={32}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck="false"
              disabled={busy}
            />
            <button className="ghost" type="submit" disabled={busy || !draft.trim()}>
              Add
            </button>
          </form>

          <div className="addword__aside">
            <button className="linkbtn" onClick={addSamples} disabled={busy}>
              + sample set
            </button>
            {testWords.length > 0 && (
              <button className="linkbtn linkbtn--danger" onClick={removeTestWords} disabled={busy}>
                remove {testWords.length} test word{testWords.length === 1 ? '' : 's'}
              </button>
            )}
          </div>

          {words.length === 0 ? (
            <p className="panel__empty">Nothing submitted yet.</p>
          ) : (
            <ul className="wordlist">
              {[...words]
                .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
                .map((word) => (
                  <li key={word.id} className={word.is_speaking ? 'is-speaking' : ''}>
                    {editingId === word.id ? (
                      <form
                        className="wordlist__edit"
                        onSubmit={(e) => {
                          e.preventDefault()
                          saveEdit(word.id)
                        }}
                      >
                        <input
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          maxLength={32}
                          autoFocus
                        />
                        <button className="linkbtn linkbtn--go" type="submit" disabled={busy}>
                          save
                        </button>
                        <button
                          className="linkbtn"
                          type="button"
                          onClick={() => setEditingId(null)}
                        >
                          cancel
                        </button>
                      </form>
                    ) : (
                      <>
                        <span className="wordlist__text">
                          {word.text}
                          {isTestWord(word) && <i className="wordlist__tag">test</i>}
                        </span>
                        <span className="wordlist__actions">
                          <button
                            className={'linkbtn' + (word.is_speaking ? ' is-on' : '')}
                            onClick={() => setSpeaking(word.id, !word.is_speaking)}
                            disabled={busy}
                            title="Highlight this word on the projector"
                          >
                            {word.is_speaking ? 'speaking' : 'highlight'}
                          </button>
                          <button className="linkbtn" onClick={() => startEdit(word)} disabled={busy}>
                            edit
                          </button>
                          <button
                            className="linkbtn linkbtn--danger"
                            onClick={() => remove(word.id)}
                            disabled={busy}
                          >
                            delete
                          </button>
                        </span>
                      </>
                    )}
                  </li>
                ))}
            </ul>
          )}
        </section>
      </div>

      <footer className="admin__foot">Signed in as {email}</footer>
    </main>
  )
}

/* ------------------------------------------------------------------ */

function Switch({ label, hint, checked, onChange, disabled, accent }) {
  return (
    <label className={'switch' + (checked ? ' is-on' : '') + (accent ? ' switch--accent' : '')}>
      <input
        type="checkbox"
        checked={Boolean(checked)}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
      />
      <span className="switch__track" aria-hidden="true">
        <span className="switch__thumb" />
      </span>
      <span className="switch__text">
        <strong>{label}</strong>
        <small>{hint}</small>
      </span>
    </label>
  )
}
