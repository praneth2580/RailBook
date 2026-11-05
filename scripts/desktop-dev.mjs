// Runs RailBook from source: Vite serves the UI with hot reload and loads the launcher's TypeScript directly.
// npm run dev -- --headed starts the scraping browser visible; Settings › Developer switches it either way.
import { existsSync } from 'node:fs'
import { createServer as createNetServer } from 'node:net'
import { createServer } from 'vite'

// Load .env.local and .env, so RAILBOOK_SITE_URL and friends set there reach the launcher. Copy .env.example to start.
// A variable already set is kept, so the shell wins over .env.local, and .env.local over .env.
for (const file of ['.env.local', '.env']) if (existsSync(file)) process.loadEnvFile(file)

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
  // The IRCTC test login, for the UI's "Login with credentials" helper. Set here and not in vite.config.ts, so a build
  // never bakes them into the bundle.
  define: {
    'import.meta.env.IRCTC_LOGIN_USERNAME': JSON.stringify(process.env.IRCTC_LOGIN_USERNAME ?? ''),
    'import.meta.env.IRCTC_LOGIN_PASSWORD': JSON.stringify(process.env.IRCTC_LOGIN_PASSWORD ?? ''),
  },
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
