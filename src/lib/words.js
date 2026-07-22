/**
 * Turning raw submissions into the tokens the cloud draws.
 *
 * Two students who both type "unemployment" should not produce two
 * overlapping copies of the same word — they produce one token that is
 * bigger, because more people care about it. That is the whole point of a
 * word cloud. The individual rows are kept in `entries` so the admin can
 * still edit or delete a single student's submission.
 */

export function normalise(text) {
  return String(text || '')
    .trim()
    .toLocaleLowerCase()
    .replace(/\s+/g, '-')
}

/** Prettiest casing to show: the one the most students used, ties -> earliest. */
function pickDisplay(entries) {
  const tally = new Map()
  for (const e of entries) {
    const t = String(e.text).trim()
    tally.set(t, (tally.get(t) || 0) + 1)
  }
  let best = entries[0] ? String(entries[0].text).trim() : ''
  let bestCount = -1
  for (const [text, count] of tally) {
    if (count > bestCount) {
      best = text
      bestCount = count
    }
  }
  return best.charAt(0).toLocaleUpperCase() + best.slice(1)
}

/**
 * @returns {Array<{key,text,count,speaking,entries,firstSeen}>} newest last
 */
export function groupWords(rows) {
  const buckets = new Map()

  for (const row of rows || []) {
    const key = normalise(row.text)
    if (!key) continue
    let bucket = buckets.get(key)
    if (!bucket) {
      bucket = { key, entries: [], firstSeen: row.created_at }
      buckets.set(key, bucket)
    }
    bucket.entries.push(row)
    if (row.created_at < bucket.firstSeen) bucket.firstSeen = row.created_at
  }

  return [...buckets.values()]
    .map((bucket) => ({
      key: bucket.key,
      text: pickDisplay(bucket.entries),
      count: bucket.entries.length,
      speaking: bucket.entries.some((e) => e.is_speaking),
      entries: bucket.entries,
      firstSeen: bucket.firstSeen,
    }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count
      return a.firstSeen < b.firstSeen ? -1 : 1
    })
}

/** Students get one word. Enforced here so the error is friendly, and in SQL so it is real. */
export function validateWord(raw) {
  const text = String(raw || '').trim().replace(/\s+/g, ' ')
  if (!text) return { ok: false, error: 'Type one word first.' }
  if (/\s/.test(text)) return { ok: false, error: 'One word only — no spaces.' }
  if (text.length > 32) return { ok: false, error: 'That word is too long (32 letters max).' }
  if (!/[\p{L}\p{N}]/u.test(text)) return { ok: false, error: 'Use letters, not just symbols.' }
  return { ok: true, text }
}
