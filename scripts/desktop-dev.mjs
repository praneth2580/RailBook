// Runs RailBook from source: Vite serves the UI with hot reload and loads the launcher's TypeScript directly.
import { createServer } from 'vite'

const vite = await createServer({ server: { middlewareMode: true }, appType: 'spa' })
try {
  const { startApp } = await vite.ssrLoadModule('/desktop/app.ts')
  await startApp({ ui: vite.middlewares })
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
} finally {
  await vite.close()
}
