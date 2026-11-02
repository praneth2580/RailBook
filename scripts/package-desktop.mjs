// Packages RailBook as a single executable:
//   1. Vite builds the UI into dist/.
//   2. Vite bundles the launcher (desktop/main.ts) into one CommonJS file with every UI file embedded in it.
//   3. pkg joins that file to a Node.js runtime.
//   4. Windows builds are marked as GUI programs, so no console window opens next to the app.
//
// Builds for this computer by default. Other targets: npm run package -- --targets node22-win-x64,node22-macos-arm64
// Keep the Windows console for debugging: npm run package -- --console
import { spawnSync } from 'node:child_process'
import { readdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { build } from 'vite'

const { values: options } = parseArgs({
  options: { targets: { type: 'string' }, console: { type: 'boolean', default: false } },
})
const PLATFORMS = { linux: 'linux', darwin: 'macos', win32: 'win' }
const targets = options.targets ?? `node22-${PLATFORMS[process.platform]}-${process.arch}`

console.log('Building the UI…')
await build({ logLevel: 'warn' })

async function embed(directory) {
  const files = {}
  for (const entry of await readdir(directory, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue
    const file = path.join(entry.parentPath, entry.name)
    const urlPath = `/${path.relative(directory, file).split(path.sep).join('/')}`
    files[urlPath] = (await readFile(file)).toString('base64')
  }
  return files
}

const files = await embed('dist')
console.log(`Bundling the launcher with ${Object.keys(files).length} UI files…`)
await build({
  configFile: false,
  logLevel: 'warn',
  // The UI, public/ included, is already embedded.
  publicDir: false,
  plugins: [
    {
      name: 'railbook-ui',
      resolveId: (id) => (id === 'virtual:railbook-ui' ? '\0railbook-ui' : null),
      load: (id) => (id === '\0railbook-ui' ? `export default ${JSON.stringify(files)}` : null),
    },
  ],
  // Bundle every dependency, so pkg only has to deal with one plain CommonJS file.
  ssr: { noExternal: true },
  build: {
    ssr: 'desktop/main.ts',
    outDir: 'build',
    emptyOutDir: true,
    target: 'node22',
    minify: false,
    rolldownOptions: { output: { format: 'cjs', entryFileNames: 'railbook.cjs' } },
  },
})

console.log(`Packaging for ${targets}…`)
await rm('release', { recursive: true, force: true })
// No bytecode step: it would need to run each target's Node, which fails when building for another platform.
const pkg = spawnSync(
  path.join('node_modules', '.bin', process.platform === 'win32' ? 'pkg.cmd' : 'pkg'),
  ['build/railbook.cjs', '--targets', targets, '--out-path', 'release', '--no-bytecode', '--public', '--compress', 'Brotli'],
  { stdio: 'inherit', shell: process.platform === 'win32' },
)
if (pkg.status !== 0) process.exit(pkg.status ?? 1)

// The PE header's Subsystem field: 3 opens a console, 2 doesn't.
async function markAsGuiProgram(file) {
  const exe = await readFile(file)
  const peOffset = exe.readUInt32LE(0x3c)
  if (exe.toString('latin1', peOffset, peOffset + 4) !== 'PE\0\0') throw new Error(`${file} isn't a Windows program.`)
  exe.writeUInt16LE(2, peOffset + 24 + 68)
  await writeFile(file, exe)
}

for (const file of await readdir('release')) {
  if (file.endsWith('.exe') && !options.console) await markAsGuiProgram(path.join('release', file))
}
console.log(`Done. Executables are in release/: ${(await readdir('release')).join(', ')}`)
