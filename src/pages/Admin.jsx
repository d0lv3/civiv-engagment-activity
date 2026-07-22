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

function Console({ email }) {
  const { words, settings, refresh, live } = useSession()
  const [editingId, setEditingId] = useState(null)
  const [editValue, setEditValue] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  const tokens = useMemo(() => groupWords(words), [words])
  const url = useMemo(() => participantUrl(), [])
  const raisedHands = words.filter((w) => w.is_speaking)

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

  const setSpeaking = (id, value) =>
    run(() => supabase.from('words').update({ is_speaking: value }).eq('id', id))

  const clearHands = () =>
    run(() => supabase.from('words').update({ is_speaking: false }).eq('is_speaking', true))

  const remove = (id) => {
    if (!window.confirm('Delete this word from the board?')) return
    run(() => supabase.from('words').delete().eq('id', id))
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
              <strong>{raisedHands.length}</strong> hand{raisedHands.length === 1 ? '' : 's'} raised
            </div>
            <button className="ghost" onClick={clearHands} disabled={busy || !raisedHands.length}>
              Clear all
            </button>
          </div>

          {raisedHands.length > 0 && (
            <ul className="hands">
              {raisedHands.map((w) => (
                <li key={w.id}>
                  <span className="hands__word">{w.text}</span>
                  <button className="linkbtn" onClick={() => setSpeaking(w.id, false)}>
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
          <QRCode value={url} size={168} className="panel__qr" />
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
                        <span className="wordlist__text">{word.text}</span>
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
