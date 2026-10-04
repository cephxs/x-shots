// Fetch one X post, normalise FxTwitter / X embed-feed data into one shape,
// and render it as an X-style card (HTML string, styled by .post in index.html).

export function parseId(input) {
  const s = String(input ?? '').trim()
  return s.match(/\/status(?:es)?\/(\d+)/)?.[1] ?? (/^\d{5,20}$/.test(s) ? s : null)
}

export async function fetchPost(id) {
  try {
    const j = await (await fetch(`https://api.fxtwitter.com/2/status/${id}`)).json()
    if (j.status) return { post: fromFx(j.status), source: 'fxtwitter' }
  } catch {}
  const token = ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, '')
  const r = await fetch(`/x-syndication/tweet-result?id=${id}&token=${token}&lang=en`)
  const j = r.ok ? await r.json().catch(() => null) : null
  if (!j?.user) throw new Error('Could not load that post. It may be deleted, private or age-restricted.')
  return { post: fromSyndication(j), source: 'x' }
}

const decode = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
const person = (name, handle, avatar, verified) => ({
  name,
  handle,
  avatar: avatar?.replace(/_(normal|bigger|mini|200x200)(?=\.\w+$)/, '_400x400'),
  verified: verified || null,
})

// X counts the display range in code points. Links swap from t.co to the form X shows.
function cleanText(raw = '', range, urls) {
  const cps = Array.from(raw)
  let text = cps.slice(range?.[0] ?? 0, range?.[1] ?? cps.length).join('')
  const links = []
  for (const u of urls) {
    if (!text.includes(u.original)) continue
    text = text.replace(u.original, u.display)
    links.push(decode(u.display))
  }
  return { text: decode(text).trim(), links }
}

export function fromFx(s) {
  const v = s.author.verification
  return {
    id: s.id,
    author: person(s.author.name, s.author.screen_name, s.author.avatar_url, v?.verified && (v.type ?? 'individual')),
    ...cleanText(s.raw_text?.text ?? s.text, s.raw_text?.display_text_range, (s.raw_text?.facets ?? []).filter(f => f.type === 'url')),
    createdAt: s.created_timestamp * 1000,
    media: (s.media?.all ?? []).map(m => ({
      type: m.type === 'photo' ? 'photo' : 'video',
      url: m.type === 'photo' ? m.url.replace('name=orig', 'name=large') : m.thumbnail_url,
      width: m.width,
      height: m.height,
    })),
    quote: s.quote ? fromFx(s.quote) : null,
    replyingTo: s.replying_to?.screen_name ?? null,
    note: s.community_note?.text ?? null,
    metrics: { replies: s.replies, reposts: s.reposts, likes: s.likes, bookmarks: s.bookmarks, views: s.views },
  }
}

export function fromSyndication(t) {
  const u = t.user
  return {
    id: t.id_str,
    author: person(u.name, u.screen_name, u.profile_image_url_https, u.verified_type?.toLowerCase() ?? ((u.is_blue_verified || u.verified) && 'individual')),
    ...cleanText(t.text, t.display_text_range, (t.entities?.urls ?? []).map(e => ({ original: e.url, display: e.display_url }))),
    createdAt: Date.parse(t.created_at),
    media: (t.mediaDetails ?? []).map(m => ({
      type: m.type === 'photo' ? 'photo' : 'video',
      url: `${m.media_url_https}?name=large`,
      width: m.original_info?.width,
      height: m.original_info?.height,
    })),
    quote: t.quoted_tweet ? fromSyndication(t.quoted_tweet) : null,
    replyingTo: t.in_reply_to_screen_name ?? null,
    note: null,
    metrics: { replies: t.conversation_count ?? t.reply_count, reposts: t.retweet_count, likes: t.favorite_count },
  }
}

const fmt = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 })
export const compact = n => fmt.format(n)

export const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Colour links, @mentions, #hashtags and $CASHTAGS the way X does. Runs on escaped text.
export function richText(p) {
  const parts = [
    ...p.links.map(l => reEsc(esc(l))),
    '(?<![\\w@])@\\w{1,15}',
    '(?<![\\w#&])#\\p{L}[\\p{L}\\p{N}_]*',
    '(?<![\\w$])\\$[A-Za-z]{1,6}(?!\\w)',
  ]
  return esc(p.text).replace(new RegExp(parts.join('|'), 'gu'), '<span class="link">$&</span>')
}

// Scalloped verified badge: 8 outward arcs around the centre of a 22×22 box.
const ROSETTE = Array.from({ length: 9 }, (_, i) => {
  const a = (i / 8) * 2 * Math.PI - Math.PI / 2
  const pt = `${(11 + 9.2 * Math.cos(a)).toFixed(2)} ${(11 + 9.2 * Math.sin(a)).toFixed(2)}`
  return i ? `A3.6 3.6 0 0 1 ${pt}` : `M${pt}`
}).join(' ') + 'Z'
const BADGE = { individual: '#1d9bf0', business: '#e2b719', government: '#829aab' }
const badge = v =>
  v
    ? `<svg class="badge" viewBox="0 0 22 22" aria-label="Verified"><path d="${ROSETTE}" fill="${BADGE[v] ?? BADGE.individual}"/><path d="M6.9 11.3l2.8 2.8 5.5-5.7" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`
    : ''

const ICON = {
  replies: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
  reposts: '<path d="m2 9 3-3 3 3"/><path d="M13 18H7a2 2 0 0 1-2-2V6"/><path d="m22 15-3 3-3-3"/><path d="M11 6h6a2 2 0 0 1 2 2v10"/>',
  likes: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
  bookmarks: '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>',
}
const COUNTS = [['replies', 'mReplies'], ['reposts', 'mReposts'], ['likes', 'mLikes'], ['bookmarks', 'mBookmarks']]
const PLAY = '<span class="play"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></span>'

function media(list) {
  if (!list.length) return ''
  const items = list.slice(0, 4)
  const ratio = items.length > 1 ? 16 / 9 : Math.min(Math.max(items[0].width / items[0].height || 16 / 9, 0.75), 2)
  return `<div class="media n${items.length}" style="aspect-ratio:${ratio}">${items
    .map(m => `<div class="cell"><img src="${esc(m.url)}" alt="">${m.type === 'photo' ? '' : PLAY}</div>`)
    .join('')}</div>`
}

function quote(q) {
  const d = new Date(q.createdAt)
  const when = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(d.getFullYear() !== new Date().getFullYear() && { year: 'numeric' }) })
  return `<div class="quote"><div class="q-head"><img class="q-avatar" src="${esc(q.author.avatar)}" alt=""><span class="name">${esc(q.author.name)}${badge(q.author.verified)}</span><span class="muted">@${esc(q.author.handle)} · ${when}</span></div>${q.text ? `<p class="q-text">${richText(q)}</p>` : ''}${media(q.media)}</div>`
}

export function cardHTML(p, o) {
  const d = new Date(p.createdAt)
  const m = p.metrics
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  const views = o.mViews && m.views ? ` · <b>${m.views.toLocaleString('en-US')}</b> Views` : ''
  const counts = COUNTS.filter(([k, toggle]) => o[toggle] && m[k] != null)
  return `<article class="post" data-theme="${o.theme}" style="width:${o.cardWidth}px;padding:${o.cardPad}px;--text:${o.textSize}px">
<header class="head"><img class="avatar" src="${esc(p.author.avatar)}" alt=""><div><div class="name">${esc(p.author.name)}${badge(p.author.verified)}</div><div class="muted">@${esc(p.author.handle)}</div></div></header>
${o.showReply && p.replyingTo ? `<p class="muted reply">Replying to <span class="link">@${esc(p.replyingTo)}</span></p>` : ''}
${p.text ? `<p class="text">${richText(p)}</p>` : ''}
${media(p.media)}
${o.showQuote && p.quote ? quote(p.quote) : ''}
${o.showNote && p.note ? `<aside class="note"><b>Readers added context</b><p>${esc(p.note)}</p></aside>` : ''}
${o.showDate ? `<p class="muted meta">${time} · ${date}${views}</p>` : ''}
${o.showMetrics && counts.length ? `<footer class="metrics${counts.length < 3 ? ' few' : ''}">${counts.map(([k]) => `<span><svg viewBox="0 0 24 24">${ICON[k]}</svg>${m[k] ? compact(m[k]) : ''}</span>`).join('')}</footer>` : ''}
</article>`
}
