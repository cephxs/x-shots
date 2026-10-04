import { createDialKit, createDialRoot } from 'dialkit/vanilla'
import 'dialkit/vanilla/styles.css'

// A DialKit popover that mirrors the side panel, synced both ways. The side panel's
// PANEL list is the one source of controls: anything added there shows up here too.

const camel = s => s.toLowerCase().replace(/[^a-z0-9]+(.)/g, (_, c) => c.toUpperCase())

// 2D values share one dial pad each. DialKit's pad Y points up, the frame's Y points down.
const PADS = { x: ['position', 'x'], y: ['position', 'y'], panX: ['pan', 'x'], panY: ['pan', 'y'], shX: ['offset', 'x'], shY: ['offset', 'y'] }

const get = (obj, path) => path.split('.').reduce((o, k) => o?.[k], obj)
const put = (obj, path, v) => {
  const keys = path.split('.')
  const last = keys.pop()
  keys.reduce((o, k) => (o[k] ??= {}), obj)[last] = v
}

export function mountDials({ panel, defaults, state, set, onUpload }) {
  const binds = {} // dial path → { kind, key } or, for pads, { kind: 'pad', x, y }
  const config = {}
  let backdropPath = ''

  for (const [title, items] of panel) {
    const f = camel(title)
    const folder = (config[f] = {})
    for (const c of items) {
      const path = `${f}.${camel(c.label ?? 'image')}`
      if (c.type === 'range' && PADS[c.key]) {
        const [pad, axis] = PADS[c.key]
        const range = [axis === 'y' ? -defaults[c.key] : defaults[c.key], c.min, c.max, 1]
        folder[pad] = { ...folder[pad], type: 'pad', [axis]: range }
        binds[`${f}.${pad}`] = { ...binds[`${f}.${pad}`], kind: 'pad', [axis]: c.key }
      } else if (c.type === 'range') {
        folder[camel(c.label)] = [defaults[c.key], c.min, c.max, 1]
        binds[path] = { kind: 'value', key: c.key }
      } else if (c.type === 'color') {
        folder[camel(c.label)] = { type: 'color', default: defaults[c.key] }
        binds[path] = { kind: 'value', key: c.key }
      } else if (c.type === 'seg') {
        folder[camel(c.label)] = { type: 'select', options: c.options.map(([value, label]) => ({ value: String(value), label })), default: String(defaults[c.key]) }
        binds[path] = { kind: 'select', key: c.key }
      } else if (c.type === 'toggles') {
        for (const [key, label] of c.items) {
          put(folder, `${camel(c.label)}.${camel(label)}`, defaults[key])
          binds[`${path}.${camel(label)}`] = { kind: 'value', key }
        }
      } else if (c.type === 'backdrops') {
        folder.image = { type: 'image', options: [], default: defaults.bg }
        binds[path] = { kind: 'value', key: 'bg' }
        backdropPath = path
      }
    }
  }

  const toDial = s => {
    const out = {}
    for (const [path, b] of Object.entries(binds)) {
      put(out, path, b.kind === 'pad' ? { x: s[b.x], y: -s[b.y] } : b.kind === 'select' ? String(s[b.key]) : s[b.key])
    }
    return out
  }

  const kit = createDialKit('x-shots', config, { id: 'x-shots-dials' })
  createDialRoot({ theme: 'dark', position: 'top-left', defaultOpen: false }) // closed, so it does not cover the preview
  kit.setValues(toDial(state))

  // Dial → app. Only changed keys go through set(), so the echo from sync() stops here.
  kit.subscribe(values => {
    const patch = {}
    for (const [path, b] of Object.entries(binds)) {
      const v = get(values, path)
      if (b.kind === 'pad') Object.assign(patch, { [b.x]: Math.round(v.x), [b.y]: Math.round(-v.y) || 0 })
      else patch[b.key] = b.kind === 'select' && typeof defaults[b.key] === 'number' ? Number(v) : v
    }
    // An image uploaded in the panel arrives as a data URL. Save it like any other backdrop.
    if (patch.bg?.startsWith('data:')) {
      onUpload(patch.bg)
      delete patch.bg
    }
    for (const k of Object.keys(patch)) if (patch[k] === state[k]) delete patch[k]
    if (Object.keys(patch).length) set(patch)
  }, false)

  return {
    // App → dial, after any change from the side panel, a look, or a drag on the canvas.
    sync: () => kit.setValues(toDial(state)),
    // Remove in the picker clears the value, and an empty bg is the gradient.
    setBackdrops(list) {
      put(config, `${backdropPath}.options`, list.map(p => ({ value: p, label: p.split('/').pop() })))
      kit.updateConfig(config)
      kit.setValues(toDial(state))
    },
  }
}
