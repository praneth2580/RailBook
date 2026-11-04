const FLAGS = new Set(['headed', 'csv'])

/** Splits `task --headed --csv --pages 3 --author=Austen` into its parts. */
export function parseCommandLine(argv: string[]) {
  const positional: string[] = []
  const flags = new Set<string>()
  const args: Record<string, string> = {}
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] as string
    if (!arg.startsWith('--')) {
      positional.push(arg)
      continue
    }
    const [key = '', inline] = arg.slice(2).split(/=(.*)/s)
    if (FLAGS.has(key) && inline === undefined) {
      flags.add(key)
      continue
    }
    const value = inline ?? argv[index + 1]
    if (value === undefined || (inline === undefined && value.startsWith('--'))) {
      throw new Error(`--${key} needs a value.`)
    }
    if (inline === undefined) index += 1
    args[key] = value
  }
  return { task: positional[0], flags, args }
}
