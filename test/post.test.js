import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseId, fromFx, fromSyndication, richText, compact } from '../src/post.js'

const fixture = name => JSON.parse(readFileSync(new URL(`fixtures/${name}.json`, import.meta.url)))

test('parseId accepts post links and bare ids', () => {
  assert.equal(parseId('https://x.com/levelsio/status/2106025279638675689?s=20'), '2106025279638675689')
  assert.equal(parseId('twitter.com/a/statuses/123456'), '123456')
  assert.equal(parseId('https://fxtwitter.com/a/status/987654321/photo/1'), '987654321')
  assert.equal(parseId(' 2106025279638675689 '), '2106025279638675689')
  assert.equal(parseId('https://x.com/levelsio'), null)
})

test('both sources normalise a reply with a link and a photo the same way', () => {
  const fx = fromFx(fixture('reply.fx').status)
  const x = fromSyndication(fixture('reply.x'))
  for (const p of [fx, x]) {
    assert.equal(p.author.handle, 'levelsio')
    assert.equal(p.text, 'Also repost nomads.com is free with a $1 check with about 4,000 new members per month')
    assert.deepEqual(p.links, ['nomads.com'])
    assert.equal(p.replyingTo, 'levelsio')
    assert.equal(p.media.length, 1)
    assert.match(p.author.avatar, /_400x400\.jpg$/)
  }
  assert.equal(fx.metrics.views, 3390)
  assert.equal(x.metrics.reposts, undefined) // X's feed has no repost count
})

test('quoted posts come through from both sources', () => {
  for (const p of [fromFx(fixture('quote.fx').status), fromSyndication(fixture('quote.x'))]) {
    assert.equal(p.quote.author.handle, 'levelsio')
    assert.equal(p.quote.media.length, 3)
    assert.ok(!p.text.includes('t.co'))
  }
})

test('richText colours links, mentions and cashtags but not prices', () => {
  const html = richText({ text: 'Try nomads.com, ask @levelsio about $TSLA for $1 & #nomads', links: ['nomads.com'] })
  assert.equal(
    html,
    'Try <span class="link">nomads.com</span>, ask <span class="link">@levelsio</span> about <span class="link">$TSLA</span> for $1 &amp; <span class="link">#nomads</span>',
  )
})

test('compact numbers match X', () => {
  assert.equal(compact(154209), '154.2K')
  assert.equal(compact(1221497), '1.2M')
  assert.equal(compact(58), '58')
})
