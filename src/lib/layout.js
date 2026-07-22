/**
 * Word cloud placement.
 *
 * Words are measured on a canvas, given a stable pseudo-random tilt, and then
 * pushed outward along an elliptical spiral until they stop colliding with
 * anything already placed. Everything random is seeded off the word itself, so
 * a word keeps its tilt for the whole session and never jitters on re-render.
 */

const FONT_FAMILY =
  "Inter, 'Segoe UI', -apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif"

// Tilts only — never upside down. Zero is weighted heavily so the cloud stays
// readable from the back of the room.
const TILTS = [0, 0, 0, 0, 0, -12, 12, -22, 22, -35, 35, -48, 48, -60, 60]

// Breathing room around a word, proportional to its size — a flat gap either
// crowds the headline words or wastes half the canvas around the small ones.
const paddingFor = (fontSize) => Math.min(11, Math.max(3, fontSize * 0.14))

// Must match .cloud__count in styles.css — the little superscript tally that
// rides along after a word that several students submitted.
const COUNT_SCALE = 0.34
const COUNT_GAP = 0.16
const MAX_SPIRAL_STEPS = 8000
const SHRINK_ATTEMPTS = 7

// Spiral shape. The pitch is how far the spiral moves outward per full turn —
// roughly one small word's height, so consecutive turns probe genuinely new
// ground. ARC_STEP keeps the distance between candidate positions constant
// instead of letting it balloon as the radius grows.
const SPIRAL_PITCH = 13
const ARC_STEP = 9

// Share of the canvas the words may cover before the whole type ramp is
// scaled down. Past roughly this much ink, tilted words stop finding gaps and
// the placer starts having to compromise.
const INK_BUDGET = 0.34

// Nothing is ever drawn smaller than this. A word nobody can read is worse
// than a word that sits a few pixels close to its neighbour.
const ABSOLUTE_MIN_SIZE = 11

function hashString(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** Small, fast, seedable PRNG. */
function mulberry32(seed) {
  let a = seed >>> 0
  return function next() {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

let measureCtx = null
function getMeasureContext() {
  if (!measureCtx) {
    const canvas = document.createElement('canvas')
    canvas.width = 8
    canvas.height = 8
    measureCtx = canvas.getContext('2d')
  }
  return measureCtx
}

function weightFor(fontSize) {
  if (fontSize >= 56) return 800
  if (fontSize >= 38) return 700
  if (fontSize >= 26) return 600
  return 500
}

function measure(text, fontSize, count = 1) {
  const ctx = getMeasureContext()
  ctx.font = `${weightFor(fontSize)} ${fontSize}px ${FONT_FAMILY}`
  let width = ctx.measureText(text).width

  if (count > 1) {
    const badgeSize = fontSize * COUNT_SCALE
    ctx.font = `700 ${badgeSize}px ${FONT_FAMILY}`
    width += fontSize * COUNT_GAP + ctx.measureText(String(count)).width
  }

  // Line-height is 0.92 in CSS; matching it here keeps the collision box the
  // same shape as the box the browser actually paints.
  const height = fontSize * 0.92
  return { width, height }
}

/** Axis-aligned box of a rotated rectangle. */
function rotatedBox(width, height, degrees) {
  const rad = (degrees * Math.PI) / 180
  const cos = Math.abs(Math.cos(rad))
  const sin = Math.abs(Math.sin(rad))
  return {
    width: width * cos + height * sin,
    height: width * sin + height * cos,
  }
}

function overlaps(a, b) {
  return !(
    a.right <= b.left ||
    a.left >= b.right ||
    a.bottom <= b.top ||
    a.top >= b.bottom
  )
}

function overlapArea(a, b) {
  const w = Math.min(a.right, b.right) - Math.max(a.left, b.left)
  const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
  if (w <= 0 || h <= 0) return 0
  return w * h
}

/**
 * @param {Array<{key,text,count,speaking}>} tokens  sorted biggest-first
 * @param {{width:number,height:number}} size        container in px
 * @returns {Array<{key,text,count,speaking,x,y,fontSize,rotation,weight,rank}>}
 */
export function layoutCloud(tokens, size) {
  const { width, height } = size
  if (!width || !height || !tokens.length) return []

  const counts = tokens.map((t) => t.count)
  const maxCount = Math.max(...counts)
  const minCount = Math.min(...counts)

  // --- Base type scale -------------------------------------------------
  // Start from the container's short edge, then damp it as the board fills up
  // so a class of forty still fits without anybody being shrunk to nothing.
  const shortEdge = Math.min(width, height)
  const density = Math.sqrt(tokens.length)
  let maxSize = Math.min(shortEdge / 4.2, (width * 0.9) / density) * 1.35
  maxSize = Math.max(30, Math.min(maxSize, 132))
  let minSize = Math.max(14, Math.min(maxSize * 0.34, 30))

  const sizeFor = (count) => {
    if (maxCount === minCount) return (maxSize + minSize) / 2
    // sqrt keeps a word said 6 times from dwarfing everything else
    const t = (Math.sqrt(count) - Math.sqrt(minCount)) / (Math.sqrt(maxCount) - Math.sqrt(minCount))
    return minSize + t * (maxSize - minSize)
  }

  // Long words must not blow past the container width.
  const fitToWidth = (text, fontSize, count) => {
    const limit = width * 0.94
    let s = fontSize
    while (s > 10 && measure(text, s, count).width > limit) s *= 0.9
    return s
  }

  // --- Ink budget ------------------------------------------------------
  // Decide every size up front, then, if the words would collectively cover
  // too much of the canvas, scale the whole ramp down at once. Shrinking
  // proportionally keeps the frequency hierarchy intact — far better than
  // letting the placer squeeze whoever happens to be placed last.
  let sizes = tokens.map((t) => fitToWidth(t.text, sizeFor(t.count), t.count))

  const inkOf = (t, s) => measure(t.text, s, t.count).width * s * 0.92
  const totalInk = tokens.reduce((sum, t, i) => sum + inkOf(t, sizes[i]), 0)
  const budget = width * height * INK_BUDGET

  if (totalInk > budget) {
    const k = Math.sqrt(budget / totalInk)
    sizes = sizes.map((s) => Math.max(ABSOLUTE_MIN_SIZE, s * k))
  }

  // Shade against the sizes actually being drawn, not the pre-budget ramp,
  // so the ink always spans its full range however much things were scaled.
  const inkMin = Math.min(...sizes)
  const inkMax = Math.max(...sizes)

  const cx = width / 2
  const cy = height / 2
  const aspect = Math.max(1, width / height)
  const placed = []
  const result = []

  tokens.forEach((token, index) => {
    const seed = hashString(token.key)
    const rng = mulberry32(seed)
    const rotation = TILTS[seed % TILTS.length]

    let fontSize = sizes[index]
    let spot = null

    for (let attempt = 0; attempt < SHRINK_ATTEMPTS && !spot; attempt++) {
      spot = findSpot({
        text: token.text,
        count: token.count,
        fontSize,
        rotation,
        rng: mulberry32(seed + attempt * 7919),
        placed,
        width,
        height,
        cx,
        cy,
        aspect,
        strict: attempt < SHRINK_ATTEMPTS - 1,
      })
      if (!spot) fontSize = Math.max(ABSOLUTE_MIN_SIZE, fontSize * 0.86)
    }

    if (!spot) return // genuinely nowhere to go — extremely unlikely

    placed.push(spot.box)
    // NB: deliberately no `speaking` here. It changes far more often than the
    // layout does, and anything cached alongside the geometry goes stale the
    // moment a hand goes up. The cloud reads that straight off the tokens.
    result.push({
      key: token.key,
      text: token.text,
      count: token.count,
      x: spot.x,
      y: spot.y,
      fontSize: spot.fontSize,
      rotation,
      weight: weightFor(spot.fontSize),
      ink: inkFor(spot.fontSize, inkMin, inkMax),
      rank: index,
    })
  })

  return result
}

/**
 * Ink shade for a word, by size.
 *
 * A cloud in one flat black reads as noise from the back of a room. Letting the
 * quieter words sit back in grey while the most-said ones stay near-black gives
 * the board depth and makes the hierarchy legible at a glance — and it leaves
 * blue as the only saturated thing on screen, so a raised hand is unmissable.
 */
function inkFor(fontSize, minSize, maxSize) {
  const span = maxSize - minSize

  // Early in the session every word is unique, so they are all the same size
  // and there is no hierarchy to express. Draw the lot at full strength —
  // fading a uniform cloud to grey would just make it look washed out.
  if (span < 0.5) return 'rgb(11, 11, 13)'

  const t = Math.min(1, Math.max(0, (fontSize - minSize) / span))
  const eased = Math.pow(t, 0.7)
  const mix = (near, far) => Math.round(far + (near - far) * eased)

  // Near-black down to a grey that still clears 4.5:1 on white — the quiet
  // words are also the physically smallest, so they cannot go any lighter and
  // stay readable from the back of the room.
  return `rgb(${mix(11, 108)}, ${mix(11, 113)}, ${mix(13, 122)})`
}

function findSpot({ text, count, fontSize, rotation, rng, placed, width, height, cx, cy, aspect, strict }) {
  const raw = measure(text, fontSize, count)
  const box = rotatedBox(raw.width, raw.height, rotation)
  const pad = paddingFor(fontSize)
  const halfW = box.width / 2 + pad
  const halfH = box.height / 2 + pad

  if (halfW * 2 > width || halfH * 2 > height) return null

  const startAngle = rng() * Math.PI * 2
  const growth = (SPIRAL_PITCH * (0.85 + rng() * 0.3)) / (Math.PI * 2)
  const limitRadius = Math.hypot(width, height)

  let fallback = null
  let fallbackScore = Infinity
  let theta = startAngle

  for (let i = 0; i < MAX_SPIRAL_STEPS; i++) {
    const radius = growth * (theta - startAngle)
    const x = cx + radius * aspect * Math.cos(theta)
    const y = cy + radius * Math.sin(theta)

    // Constant arc length between probes: fine near the centre where the big
    // words live, and still fine far out where the small ones look for gaps.
    theta += Math.min(0.6, Math.max(0.02, ARC_STEP / Math.max(radius, 10)))

    const candidate = {
      left: x - halfW,
      right: x + halfW,
      top: y - halfH,
      bottom: y + halfH,
    }

    const inBounds =
      candidate.left >= 0 &&
      candidate.top >= 0 &&
      candidate.right <= width &&
      candidate.bottom <= height

    if (!inBounds) {
      // Once the spiral has left the board in every direction, stop.
      if (radius > limitRadius) break
      continue
    }

    let collided = false
    let score = 0
    for (const other of placed) {
      if (overlaps(candidate, other)) {
        collided = true
        if (strict) break
        score += overlapArea(candidate, other)
      }
    }

    if (!collided) {
      return { x, y, fontSize, box: candidate }
    }

    if (!strict && score < fallbackScore) {
      fallbackScore = score
      fallback = { x, y, fontSize, box: candidate }
    }
  }

  // Last resort on the final attempt: the least-overlapping legal position,
  // so a student's word is nudged rather than dropped.
  return strict ? null : fallback
}
