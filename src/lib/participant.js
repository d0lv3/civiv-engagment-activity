/**
 * Everything the student's browser remembers between refreshes.
 * Stored in localStorage so a reload never restarts their turn.
 */

const KEY_ID = 'civic-cloud.participant-id'
const KEY_WORD = 'civic-cloud.my-word'

function randomId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return 'p-' + Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function read(key) {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key, value) {
  try {
    if (value === null) window.localStorage.removeItem(key)
    else window.localStorage.setItem(key, value)
  } catch {
    /* private mode — the session just won't survive a refresh */
  }
}

/** A stable anonymous id for this phone. Created once, reused forever. */
export function getParticipantId() {
  let id = read(KEY_ID)
  if (!id) {
    id = randomId()
    write(KEY_ID, id)
  }
  return id
}

/** The word this phone submitted: { id, text } — or null. */
export function getMyWord() {
  const raw = read(KEY_WORD)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    return parsed && parsed.id ? parsed : null
  } catch {
    return null
  }
}

export function setMyWord(word) {
  if (!word) write(KEY_WORD, null)
  else write(KEY_WORD, JSON.stringify({ id: word.id, text: word.text }))
}

export function clearMyWord() {
  write(KEY_WORD, null)
}
