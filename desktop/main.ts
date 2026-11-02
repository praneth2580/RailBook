// Entry point of the packaged app. scripts/package-desktop.mjs bundles it with the built UI embedded.
import files from 'virtual:railbook-ui'
import { log, startApp } from './app'
import { embeddedUi } from './ui'

startApp({ ui: embeddedUi(files) }).then(
  () => process.exit(0),
  (error: unknown) => {
    log(error instanceof Error ? error.message : String(error))
    process.exit(1)
  },
)
