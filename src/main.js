import { domToCanvas } from 'modern-screenshot'
import { parseId, fetchPost, cardHTML, esc } from './post.js'
// The Default Template look is the default for every control. bg '' means gradient.
import DEFAULTS from '../presets/Default Template.json'

const FRAMES = { '16:9': [1600, 900], '1:1': [1200, 1200], '4:5': [1080, 1350], '9:16': [1080, 1920] }
const CARD_KEYS = ['theme', 'cardWidth', 'textSize', 'cardPad', 'showReply', 'showQuote', 'showNote', 'showDate', 'showMetrics', 'mReplies', 'mReposts', 'mLikes', 'mBookmarks', 'mViews']
const BG_KEYS = ['g1', 'g2', 'gAngle', 'blur', 'brightness', 'contrast', 'saturate', 'zoom', 'panX', 'panY', 'tint', 'tintAmt', 'grain']

const range = (key, label, min, max, unit = '', when) => ({ type: 'range', key, label, min, max, unit, when })
const seg = (key, label, options, when) => ({ type: 'seg', key, label, options, when })
const color = (key, label, when) => ({ type: 'color', key, label, when })
const toggles = (label, items, when) => ({ type: 'toggles', label, items, when })
const isImage = s => !!s.bg
const isGradient = s => !s.bg
const isFixed = s => s.aspect !== 'auto'
const isPost = () => !shot // post-only rows grey out while an image is the subject

const PANEL = [
  ['Card', [
    seg('theme', 'Theme', [['light', 'Light'], ['dim', 'Dim'], ['dark', 'Lights out']], isPost),
    range('cardWidth', 'Width', 420, 720, 'px'),
    range('textSize', 'Text size', 14, 24, 'px', isPost),
    range('cardPad', 'Padding', 12, 40, 'px', isPost),
    range('radius', 'Radius', 0, 48, 'px'),
    toggles('Show', [['showReply', 'Replying to'], ['showQuote', 'Quote'], ['showNote', 'Note'], ['showDate', 'Date'], ['showMetrics', 'Metrics']], isPost),
    toggles('Counts', [['mReplies', 'Replies'], ['mReposts', 'Reposts'], ['mLikes', 'Likes'], ['mBookmarks', 'Bookmarks'], ['mViews', 'Views']], isPost),
  ]],
  ['Frame', [
    seg('aspect', 'Aspect', ['16:9', '1:1', '4:5', '9:16', 'auto'].map(a => [a, a === 'auto' ? 'Auto' : a])),
    range('size', 'Size', 20, 120, '%', isFixed),
    range('x', 'Position X', -100, 100, '', isFixed),
    range('y', 'Position Y', -100, 100, '', isFixed),
    range('autoPad', 'Padding', 16, 240, 'px', s => s.aspect === 'auto'),
  ]],
  ['Backdrop', [
    { type: 'backdrops' },
    color('g1', 'From', isGradient),
    color('g2', 'To', isGradient),
    range('gAngle', 'Angle', 0, 360, '°', isGradient),
    range('blur', 'Blur', 0, 80, 'px'),
    range('brightness', 'Brightness', 40, 160, '%'),
    range('contrast', 'Contrast', 40, 160, '%'),
    range('saturate', 'Saturation', 0, 200, '%'),
    range('zoom', 'Zoom', 100, 300, '%', isImage),
    range('panX', 'Pan X', -100, 100, '', isImage),
    range('panY', 'Pan Y', -100, 100, '', isImage),
    color('tint', 'Tint'),
    range('tintAmt', 'Tint amount', 0, 80, '%'),
    range('grain', 'Grain', 0, 100, '%'),
  ]],
  ['Glass rim', [
    range('rim', 'Width', 0, 40, 'px'),
    range('rimBlur', 'Blur', 0, 60, 'px'),
    color('rimColor', 'Tint'),
    range('rimOpacity', 'Tint amount', 0, 60, '%'),
    range('rimEdge', 'Edge light', 0, 60, '%'),
  ]],
  ['Shadow', [
    color('shColor', 'Color'),
    range('shOpacity', 'Opacity', 0, 100, '%'),
    range('shBlur', 'Blur', 0, 160, 'px'),
    range('shX', 'Offset X', -80, 80, 'px'),
    range('shY', 'Offset Y', -80, 80, 'px'),
    range('shSpread', 'Spread', -20, 40, 'px'),
  ]],
]
const CONTROLS = PANEL.flatMap(([, items]) => items)
const RANGES = Object.fromEntries(CONTROLS.filter(c => c.type === 'range').map(c => [c.key, c]))

const $ = s => document.querySelector(s)
const stage = $('#stage')
const canvas = $('#canvas')
const ctx = canvas.getContext('2d')

// ---------- state ----------

const STORE = 'x-shots'
let saved = {}
try { saved = JSON.parse(localStorage.getItem(STORE)) ?? {} } catch {}
const state = { ...DEFAULTS, ...saved.state }
// What the card shows: { kind: 'x', url } or { kind: 'image', src }.
let subject = saved.subject ?? (saved.url ? { kind: 'x', url: saved.url } : null)
let post = null
let shot = null
let presets = []
const persist = () => { try { localStorage.setItem(STORE, JSON.stringify({ state, subject })) } catch {} }
// The load event fires even in a hidden tab. img.decode() waits for a rendered frame.
const loadImage = src => new Promise((res, rej) => Object.assign(new Image(), { onload: e => res(e.target), onerror: rej, src }))
const say = (sel, msg = '', warn = false) => { const el = $(sel); el.textContent = msg; el.classList.toggle('warn', warn) }

function set(patch) {
  Object.assign(state, patch)
  syncControls()
  persist()
  if ('bg' in patch) loadBg().then(requestDraw)
  if (Object.keys(patch).some(k => CARD_KEYS.includes(k))) refreshCard()
  else requestDraw()
}

// ---------- panel ----------

function controlHTML(c) {
  const lab = `<label class="lab" for="c-${c.key}" data-reset="${c.key}" title="Double-click to reset">${c.label}</label>`
  const row = inner => `<div class="row" data-row="${c.key}">${inner}</div>`
  switch (c.type) {
    case 'range':
      return row(`${lab}<input type="range" id="c-${c.key}" data-key="${c.key}" min="${c.min}" max="${c.max}" step="1"><input class="num" type="number" data-key="${c.key}" min="${c.min}" max="${c.max}" step="1" aria-label="${c.label}"><span class="unit">${c.unit}</span>`)
    case 'color':
      return row(`${lab}<input type="color" id="c-${c.key}" data-key="${c.key}"><span class="hex" data-hex="${c.key}"></span>`)
    case 'seg':
      return row(`<span class="lab" data-reset="${c.key}">${c.label}</span><div class="seg" role="group" aria-label="${c.label}">${c.options.map(([v, t]) => `<button type="button" data-key="${c.key}" data-value="${v}">${t}</button>`).join('')}</div>`)
    case 'toggles':
      return `<div class="row" data-row="${c.label}"><span class="lab">${c.label}</span><div class="chips">${c.items.map(([k, t]) => `<button type="button" class="chip" data-key="${k}" data-toggle>${t}</button>`).join('')}</div></div>`
    case 'backdrops':
      return '<div class="rail" id="backdrops"></div>'
  }
}
$('#controls').innerHTML = PANEL.map(([title, items]) => `<details class="sec" open><summary>${title}</summary>${items.map(controlHTML).join('')}</details>`).join('')

function syncControls() {
  for (const el of document.querySelectorAll('[data-key]')) {
    const v = state[el.dataset.key]
    if (el.tagName === 'BUTTON') el.setAttribute('aria-pressed', 'toggle' in el.dataset ? !!v : el.dataset.value === String(v))
    else if (el.type !== 'number' || el !== document.activeElement) el.value = v
    if (el.type === 'range') el.style.setProperty('--p', `${((v - el.min) / (el.max - el.min)) * 100}%`)
  }
  for (const el of document.querySelectorAll('[data-hex]')) el.textContent = state[el.dataset.hex]
  for (const c of CONTROLS) if (c.when) $(`[data-row="${c.key ?? c.label}"]`).inert = !c.when(state)
  for (const t of document.querySelectorAll('.tile[data-bg]')) t.setAttribute('aria-pressed', t.dataset.bg === state.bg)
  const g = $('.tile[data-bg=""]')
  if (g) g.style.backgroundImage = `linear-gradient(${state.gAngle}deg, ${state.g1}, ${state.g2})`
}

document.addEventListener('input', e => {
  const el = e.target
  const key = el.dataset?.key
  if (!key) return
  if (el.type === 'color') return set({ [key]: el.value })
  const c = RANGES[key]
  const v = Number(el.value)
  if (c && el.value !== '' && Number.isFinite(v)) set({ [key]: Math.min(c.max, Math.max(c.min, v)) })
})
document.addEventListener('focusout', () => setTimeout(syncControls)) // show the clamped value after typing
document.addEventListener('dblclick', e => {
  const key = e.target.closest('[data-reset]')?.dataset.reset
  if (key) set({ [key]: DEFAULTS[key] })
})
document.addEventListener('click', e => {
  const b = e.target.closest('button[data-key], [data-bg], [data-preset]')
  if (!b) return
  if (b.dataset.preset != null) {
    const p = presets[b.dataset.preset]
    set({ ...DEFAULTS, ...p.config })
    return say('#preset-status', `Applied ${p.name}`)
  }
  if (b.dataset.bg != null) return set({ bg: b.dataset.bg })
  const key = b.dataset.key
  if ('toggle' in b.dataset) set({ [key]: !state[key] })
  else set({ [key]: isNaN(b.dataset.value) ? b.dataset.value : Number(b.dataset.value) })
})

// ---------- post ----------

async function loadPost(input) {
  const id = parseId(input)
  if (!id) return say('#status', 'Paste a link to an X post, for example x.com/user/status/123.', true)
  say('#status', 'Loading post…')
  try {
    const r = await fetchPost(id)
    post = r.post
    shot = null
    subject = { kind: 'x', url: input.trim() }
    persist()
    syncControls()
    say('#status', r.source === 'x' ? 'FxTwitter did not respond, so this came from X’s own feed. Reposts, bookmarks, views and notes are not available.' : '', r.source === 'x')
    refreshCard()
  } catch (e) {
    say('#status', e.message, true)
  }
}
$('#load').addEventListener('submit', e => { e.preventDefault(); loadPost($('#url').value) })
$('#url').addEventListener('paste', () => setTimeout(() => loadPost($('#url').value)))

async function loadShot(src) {
  try {
    shot = await loadImage(src)
  } catch {
    return say('#status', `Could not open ${src.slice(1)}.`, true)
  }
  post = null
  subject = { kind: 'image', src }
  persist()
  say('#status', '')
  syncControls()
  refreshCard()
}

// A post is laid out as HTML off screen, then turned into an image for the canvas.
// An image is used as is, at the card width.
async function rasterCard(scale) {
  if (shot) return { canvas: shot, w: state.cardWidth, h: (state.cardWidth * shot.naturalHeight) / shot.naturalWidth }
  const host = document.createElement('div')
  host.innerHTML = cardHTML(post, state)
  $('#offscreen').append(host)
  const el = host.firstElementChild
  try {
    return { canvas: await domToCanvas(el, { scale }), w: el.offsetWidth, h: el.offsetHeight }
  } finally {
    host.remove()
  }
}

// At most one raster in flight; changes that land meanwhile trigger one more pass.
let rastering = false
let rasterAgain = false
async function refreshCard() {
  if (!post && !shot) return requestDraw()
  if (rastering) return void (rasterAgain = true)
  rastering = true
  try {
    cache.card = await rasterCard(2)
  } catch (e) {
    say('#status', `Could not draw the card: ${e.message}`, true)
  }
  rastering = false
  requestDraw()
  if (rasterAgain) { rasterAgain = false; refreshCard() }
}

// ---------- backdrop ----------

let bgImage = null
async function loadBg() {
  const src = state.bg
  if (!src) return void (bgImage = null)
  try {
    const img = await loadImage(src)
    if (state.bg === src) bgImage = img
  } catch {
    // Keep the saved choice. The file can come back, for example after a dev-server restart.
    if (state.bg === src) { bgImage = null; say('#status', `Backdrop ${src} is missing. The gradient shows until it is back.`, true) }
  }
}

// dir is 'backdrops' or 'shots'. Returns the saved path, or nothing on failure.
async function upload(file, dir) {
  say('#status', 'Saving image…')
  const r = await fetch(`/api/upload?dir=${dir}&name=${encodeURIComponent(file.name || 'pasted.png')}`, { method: 'POST', body: file })
  const j = await r.json()
  if (!r.ok) return say('#status', j.error, true)
  say('#status', `Saved ${j.path.slice(1)}`)
  return j.path
}
const addBackdrop = async file => {
  const path = await upload(file, 'backdrops')
  if (path) { await loadLibrary(); set({ bg: path }) }
}
const addShot = async file => {
  const path = await upload(file, 'shots')
  if (path) loadShot(path)
}
const firstImage = files => [...files].find(f => f.type.startsWith('image/'))

async function loadLibrary() {
  const lib = await fetch('/api/library').then(r => r.json()).catch(() => ({ backdrops: [], presets: [] }))
  $('#backdrops').innerHTML = [
    '<button type="button" class="tile" data-bg="" title="Gradient" aria-label="Gradient"></button>',
    ...lib.backdrops.map(p => `<button type="button" class="tile" data-bg="${esc(p)}" style="background-image:url('${esc(p)}')" title="${esc(p.split('/').pop())}" aria-label="Backdrop ${esc(p.split('/').pop())}"></button>`),
    '<label class="tile" title="Upload an image" aria-label="Upload an image">+<input type="file" accept="image/*" hidden></label>',
  ].join('')
  presets = lib.presets
  $('#presets').innerHTML = presets.map((p, i) => `<button type="button" class="chip" data-preset="${i}">${esc(p.name)}</button>`).join('') || '<span class="status">No saved looks yet.</span>'
  syncControls()
}
$('#controls').addEventListener('change', e => { if (e.target.type === 'file' && e.target.files[0]) addBackdrop(e.target.files[0]) })
$('#shot-file').addEventListener('change', e => { if (e.target.files[0]) addShot(e.target.files[0]) })

// Drop where the image goes: on the preview it becomes the subject, on the Backdrop rail the backdrop.
for (const [zone, add] of [[stage, addShot], [$('#backdrops'), addBackdrop]]) {
  zone.addEventListener('dragover', e => { e.preventDefault(); e.stopPropagation(); zone.classList.add('drop') })
  zone.addEventListener('dragleave', e => { if (!zone.contains(e.relatedTarget)) zone.classList.remove('drop') })
  zone.addEventListener('drop', e => {
    e.preventDefault()
    zone.classList.remove('drop')
    const f = firstImage(e.dataTransfer.files)
    if (f) add(f)
  })
}
document.addEventListener('paste', e => {
  if (e.target.closest?.('input')) return
  const f = firstImage(e.clipboardData.files)
  if (f) return addShot(f)
  const text = e.clipboardData.getData('text')
  if (parseId(text)) { $('#url').value = text; loadPost(text) }
})

// ---------- looks ----------

$('#save').addEventListener('submit', async e => {
  e.preventDefault()
  const name = $('#preset-name').value.trim()
  if (!name) return say('#preset-status', 'Type a name first.', true)
  const r = await fetch(`/api/preset?name=${encodeURIComponent(name)}`, { method: 'POST', body: JSON.stringify(state, null, 2) })
  const j = await r.json()
  if (!r.ok) return say('#preset-status', j.error, true)
  say('#preset-status', `Saved ${j.path}`)
  loadLibrary()
})

// ---------- compositor ----------

const canvasOf = (w, h) => Object.assign(document.createElement('canvas'), { width: Math.max(1, Math.round(w)), height: Math.max(1, Math.round(h)) })
const rgba = (hex, a) => {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`
}
const cardSize = () => cache.card ?? { w: state.cardWidth, h: state.cardWidth * 0.6 }

function frameSize() {
  if (state.aspect !== 'auto') return FRAMES[state.aspect]
  const { w, h } = cardSize()
  const e = 2 * (state.rim + state.autoPad)
  return [Math.round(w + e), Math.round(h + e)]
}

// Group = card + glass rim, in card px. s scales it into frame px.
function layout(W, H) {
  const { w, h } = cardSize()
  const gw = w + 2 * state.rim
  const gh = h + 2 * state.rim
  if (state.aspect === 'auto') return { s: 1, gw, gh, gx: state.autoPad, gy: state.autoPad }
  const margin = Math.min(W, H) * 0.06
  const s = (Math.min((W - 2 * margin) / gw, (H - 2 * margin) / gh) * state.size) / 100
  const fx = (W - gw * s) / 2
  const fy = (H - gh * s) / 2
  return { s, gw, gh, gx: fx + (state.x / 100) * Math.max(fx, 0), gy: fy + (state.y / 100) * Math.max(fy, 0) }
}

// Stretch the outer pixel rows/columns outward so a blur near the frame edge has
// real colour to pull from instead of fading to transparent.
function extend(src, p) {
  const { width: w, height: h } = src
  const c = canvasOf(w + 2 * p, h + 2 * p)
  const x = c.getContext('2d')
  x.imageSmoothingEnabled = false
  x.drawImage(src, p, p)
  x.drawImage(src, 0, 0, w, 1, p, 0, w, p)
  x.drawImage(src, 0, h - 1, w, 1, p, h + p, w, p)
  x.drawImage(c, p, 0, 1, h + 2 * p, 0, 0, p, h + 2 * p)
  x.drawImage(c, w + p - 1, 0, 1, h + 2 * p, w + p, 0, p, h + 2 * p)
  return c
}

function blurred(src, px) {
  const c = canvasOf(src.width, src.height)
  const x = c.getContext('2d')
  const p = Math.ceil(px * 2)
  x.filter = `blur(${px}px)`
  x.drawImage(p ? extend(src, p) : src, -p, -p)
  return c
}

let noiseTile
function noise() {
  if (noiseTile) return noiseTile
  noiseTile = canvasOf(256, 256)
  const x = noiseTile.getContext('2d')
  const d = x.createImageData(256, 256)
  for (let i = 0; i < d.data.length; i += 4) {
    d.data[i] = d.data[i + 1] = d.data[i + 2] = Math.random() * 255
    d.data[i + 3] = 255
  }
  x.putImageData(d, 0, 0)
  return noiseTile
}

function renderBackdrop(W, H, k) {
  const src = canvasOf(W * k, H * k)
  const { width: w, height: h } = src
  const c = src.getContext('2d')
  if (bgImage) {
    const { naturalWidth: iw, naturalHeight: ih } = bgImage
    const sc = (Math.max(w / iw, h / ih) * state.zoom) / 100
    const dw = iw * sc
    const dh = ih * sc
    c.drawImage(bgImage, ((w - dw) / 2) * (1 + state.panX / 100), ((h - dh) / 2) * (1 + state.panY / 100), dw, dh)
  } else {
    const a = (state.gAngle * Math.PI) / 180
    const dx = Math.sin(a)
    const dy = -Math.cos(a)
    const L = Math.abs((w / 2) * dx) + Math.abs((h / 2) * dy)
    const g = c.createLinearGradient(w / 2 - dx * L, h / 2 - dy * L, w / 2 + dx * L, h / 2 + dy * L)
    g.addColorStop(0, state.g1)
    g.addColorStop(1, state.g2)
    c.fillStyle = g
    c.fillRect(0, 0, w, h)
  }

  const out = canvasOf(w, h)
  const o = out.getContext('2d')
  const p = Math.ceil(state.blur * k * 2)
  o.filter = `blur(${state.blur * k}px) brightness(${state.brightness}%) contrast(${state.contrast}%) saturate(${state.saturate}%)`
  o.drawImage(p ? extend(src, p) : src, -p, -p)
  o.filter = 'none'
  if (state.tintAmt) {
    o.fillStyle = rgba(state.tint, state.tintAmt / 100)
    o.fillRect(0, 0, w, h)
  }
  // Grain also hides the banding that heavy blur and smooth gradients leave behind.
  if (state.grain) {
    o.globalAlpha = (state.grain / 100) * 0.35
    o.globalCompositeOperation = 'overlay'
    o.fillStyle = o.createPattern(noise(), 'repeat')
    o.fillRect(0, 0, w, h)
    o.globalAlpha = 1
    o.globalCompositeOperation = 'source-over'
  }
  return out
}

function compose(ctx, W, H, k, bg, rimBg, card) {
  ctx.drawImage(bg, 0, 0)
  if (!card) return
  const L = layout(W, H)
  const u = L.s * k
  const gx = L.gx * k
  const gy = L.gy * k
  const gw = L.gw * u
  const gh = L.gh * u
  const r = state.rim * u
  const cr = state.radius * u
  const or = cr + r // outer radius is derived (card radius + rim) so the corners stay concentric
  const { width: cw, height: ch } = ctx.canvas

  // Shadow only outside the group, like CSS box-shadow, so it never darkens the glass.
  if (state.shOpacity) {
    const sp = state.shSpread * u
    const off = cw + ch + 10000
    const outside = new Path2D()
    outside.rect(0, 0, cw, ch)
    outside.roundRect(gx, gy, gw, gh, or)
    ctx.save()
    ctx.clip(outside, 'evenodd')
    ctx.shadowColor = rgba(state.shColor, state.shOpacity / 100)
    ctx.shadowBlur = state.shBlur * u
    ctx.shadowOffsetX = state.shX * u + off
    ctx.shadowOffsetY = state.shY * u
    ctx.beginPath()
    ctx.roundRect(gx - sp - off, gy - sp, gw + 2 * sp, gh + 2 * sp, Math.max(0, or + sp))
    ctx.fill()
    ctx.restore()
  }

  if (r > 0 && rimBg) {
    const ring = new Path2D()
    ring.roundRect(gx, gy, gw, gh, or)
    ring.roundRect(gx + r, gy + r, gw - 2 * r, gh - 2 * r, cr)
    ctx.save()
    ctx.clip(ring, 'evenodd')
    ctx.drawImage(rimBg, 0, 0)
    ctx.fillStyle = rgba(state.rimColor, state.rimOpacity / 100)
    ctx.fillRect(gx, gy, gw, gh)
    ctx.restore()
    if (state.rimEdge) {
      ctx.strokeStyle = rgba('#ffffff', state.rimEdge / 100)
      ctx.lineWidth = k
      ctx.beginPath()
      ctx.roundRect(gx + k / 2, gy + k / 2, gw - k, gh - k, Math.max(0, or - k / 2))
      ctx.stroke()
    }
  }

  const x = gx + r
  const y = gy + r
  const w = gw - 2 * r
  const h = gh - 2 * r
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, cr)
  ctx.clip()
  ctx.drawImage(card.canvas, x, y, w, h)
  ctx.restore()
  // 1px card edge: pure black or white at 10%, never tinted
  ctx.strokeStyle = state.theme === 'light' ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)'
  ctx.lineWidth = k
  ctx.beginPath()
  ctx.roundRect(x + k / 2, y + k / 2, w - k, h - k, Math.max(0, cr - k / 2))
  ctx.stroke()
}

// ---------- preview ----------

const cache = { bgKey: '', bg: null, rimKey: '', rim: null, card: null }

function fitCanvas(W, H) {
  const pad = 40
  const z = Math.min((stage.clientWidth - pad * 2) / W, (stage.clientHeight - pad * 2) / H)
  const cssW = Math.max(1, Math.floor(W * z))
  const cssH = Math.max(1, Math.floor(H * z))
  canvas.style.width = `${cssW}px`
  canvas.style.height = `${cssH}px`
  const pw = Math.round(cssW * devicePixelRatio)
  const ph = Math.round(cssH * devicePixelRatio)
  if (canvas.width !== pw || canvas.height !== ph) Object.assign(canvas, { width: pw, height: ph })
  return pw / W
}

function draw() {
  const [W, H] = frameSize()
  const k = fitCanvas(W, H)
  const bgKey = JSON.stringify([W, H, canvas.width, bgImage?.src, ...BG_KEYS.map(key => state[key])])
  if (bgKey !== cache.bgKey) Object.assign(cache, { bgKey, bg: renderBackdrop(W, H, k), rimKey: '' })
  const rimKey = bgKey + state.rimBlur
  if (state.rim && rimKey !== cache.rimKey) Object.assign(cache, { rimKey, rim: blurred(cache.bg, state.rimBlur * k) })
  compose(ctx, W, H, k, cache.bg, cache.rim, cache.card)
  $('#dims').textContent = `${Math.round(W * state.scale)} × ${Math.round(H * state.scale)}`
  $('#hint').hidden = !!cache.card
}

let frame = 0
const requestDraw = () => { frame ||= requestAnimationFrame(() => { frame = 0; draw() }) }

// Drag the card to move it. It snaps to centre within 3%.
function hit(e) {
  if (!cache.card || state.aspect === 'auto') return null
  const [W, H] = frameSize()
  const L = layout(W, H)
  const box = canvas.getBoundingClientRect()
  const z = box.width / W
  const px = (e.clientX - box.left) / z
  const py = (e.clientY - box.top) / z
  const inside = px >= L.gx && py >= L.gy && px <= L.gx + L.gw * L.s && py <= L.gy + L.gh * L.s
  return inside ? { W, H, L, z } : null
}
canvas.addEventListener('pointermove', e => { if (!canvas.hasPointerCapture(e.pointerId)) canvas.style.cursor = hit(e) ? 'grab' : '' })
canvas.addEventListener('pointerdown', e => {
  const h = hit(e)
  if (!h) return
  canvas.setPointerCapture(e.pointerId)
  canvas.style.cursor = 'grabbing'
  const fx = Math.max((h.W - h.L.gw * h.L.s) / 2, 1)
  const fy = Math.max((h.H - h.L.gh * h.L.s) / 2, 1)
  const start = { x: state.x, y: state.y, cx: e.clientX, cy: e.clientY }
  const snap = v => (Math.abs(v) < 3 ? 0 : Math.min(100, Math.max(-100, Math.round(v))))
  const ac = new AbortController()
  canvas.addEventListener('pointermove', ev => set({
    x: snap(start.x + ((ev.clientX - start.cx) / h.z / fx) * 100),
    y: snap(start.y + ((ev.clientY - start.cy) / h.z / fy) * 100),
  }), { signal: ac.signal })
  const end = () => { ac.abort(); canvas.style.cursor = 'grab' }
  canvas.addEventListener('pointerup', end, { signal: ac.signal })
  canvas.addEventListener('pointercancel', end, { signal: ac.signal })
})

// ---------- export ----------

async function exportPNG() {
  const [W, H] = frameSize()
  const k = state.scale
  const card = (post || shot) && (await rasterCard(layout(W, H).s * k))
  const out = canvasOf(W * k, H * k)
  const bg = renderBackdrop(W, H, k)
  compose(out.getContext('2d'), W, H, k, bg, state.rim ? blurred(bg, state.rimBlur * k) : null, card)
  return new Promise(res => out.toBlob(res, 'image/png'))
}

function report(blob, verb) {
  const [W, H] = frameSize()
  const mb = blob.size / 1e6
  const over = mb > 5
  const fix = state.grain ? 'Turn grain down (noise does not compress) or use a lower scale' : 'Use a lower scale'
  say('#export-status', `${verb} ${Math.round(W * state.scale)} × ${Math.round(H * state.scale)}, ${mb.toFixed(1)} MB.${over ? ` X can recompress or refuse images over 5 MB. ${fix} to post it as is.` : ''}`, over)
}

$('#copy').addEventListener('click', async () => {
  say('#export-status', 'Rendering…')
  const blob = exportPNG()
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
    report(await blob, 'Copied')
  } catch (e) {
    say('#export-status', `Copy failed: ${e.message}`, true)
  }
})
$('#download').addEventListener('click', async () => {
  say('#export-status', 'Rendering…')
  const blob = await exportPNG()
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = post ? `x-${post.author.handle}-${post.id}.png` : `shot-${Date.now()}.png`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  report(blob, 'Downloaded')
})

// ---------- start ----------

syncControls()
new ResizeObserver(requestDraw).observe(stage)
loadBg().then(requestDraw)
loadLibrary()
if (subject?.kind === 'x') { $('#url').value = subject.url; loadPost(subject.url) }
if (subject?.kind === 'image') loadShot(subject.src)
