// Runs RailBook from source: Vite serves the UI with hot reload and loads the launcher's TypeScript directly.
// npm run dev -- --headed starts the scraping browser visible; Settings › Developer switches it either way.
import { existsSync } from 'node:fs'
import { createServer as createNetServer } from 'node:net'
import { createServer } from 'vite'

// Load .env, so RAILBOOK_SITE_URL and friends set there reach the launcher. Copy .env.example to start.
if (existsSync('.env')) process.loadEnvFile('.env')

// Hot reload needs a WebSocket server of its own, since RailBook's server only answers pages and its API.
const hmrPort = await new Promise((resolve) => {
  const probe = createNetServer().listen(0, '127.0.0.1', () => {
    const { port } = probe.address()
    probe.close(() => resolve(port))
  })
})

const vite = await createServer({
  server: { middlewareMode: true, hmr: { host: '127.0.0.1', port: hmrPort } },
  appType: 'spa',
})
try {
  const { startApp } = await vite.ssrLoadModule('/desktop/app.ts')
  await startApp({ ui: vite.middlewares, dev: { headed: process.argv.includes('--headed') } })
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
} finally {
  await vite.close()
}
