import { defineConfig } from 'vite'
import fs from 'node:fs/promises'
import path from 'node:path'

const IMAGE = /^\.(jpe?g|png|webp|gif|avif)$/i
const UPLOAD_DIRS = ['backdrops', 'shots']
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'untitled'

// Local save endpoints: backdrops/ and shots/ (framed images) for uploads, presets/*.json for looks.
function library() {
  return {
    name: 'x-shots-library',
    configureServer(server) {
      const dir = name => path.join(server.config.root, name)
      server.middlewares.use('/api', async (req, res) => {
        const url = new URL(req.url, 'http://local')
        const name = url.searchParams.get('name') ?? ''
        const send = (code, body) => {
          res.statusCode = code
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify(body))
        }
        try {
          for (const d of [...UPLOAD_DIRS, 'presets']) await fs.mkdir(dir(d), { recursive: true })

          if (req.method === 'GET' && url.pathname === '/library') {
            const backdrops = (await fs.readdir(dir('backdrops')))
              .filter(f => IMAGE.test(path.extname(f)))
              .map(f => `/backdrops/${f}`)
            const presets = await Promise.all(
              (await fs.readdir(dir('presets')))
                .filter(f => f.endsWith('.json'))
                .map(async f => ({ name: f.slice(0, -5), config: JSON.parse(await fs.readFile(path.join(dir('presets'), f), 'utf8')) })),
            )
            return send(200, { backdrops, presets })
          }

          if (req.method === 'POST') {
            const body = Buffer.concat(await Array.fromAsync(req))
            if (url.pathname === '/upload') {
              const to = url.searchParams.get('dir')
              const ext = path.extname(name).toLowerCase()
              if (!UPLOAD_DIRS.includes(to)) return send(400, { error: 'Unknown upload folder.' })
              if (!IMAGE.test(ext)) return send(400, { error: 'Use a JPG, PNG, WebP, GIF or AVIF image.' })
              const file = `${slug(path.basename(name, ext))}-${Date.now().toString(36)}${ext}`
              await fs.writeFile(path.join(dir(to), file), body)
              return send(200, { path: `/${to}/${file}` })
            }
            if (url.pathname === '/preset') {
              JSON.parse(body) // refuse anything that is not JSON
              const file = `${name.replace(/[^\w .-]/g, '').trim() || 'untitled'}.json` // keep the name as typed
              await fs.writeFile(path.join(dir('presets'), file), body)
              return send(200, { path: `presets/${file}` })
            }
          }
          send(404, { error: 'Not found' })
        } catch (e) {
          send(500, { error: e.message })
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [library()],
  server: {
    port: 5190,
    watch: { ignored: ['**/backdrops/**', '**/shots/**'] },
    // X's embed feed only allows its own origin, so the fallback goes through here.
    proxy: {
      '/x-syndication': {
        target: 'https://cdn.syndication.twimg.com',
        changeOrigin: true,
        rewrite: p => p.replace(/^\/x-syndication/, ''),
      },
    },
  },
})
