export interface RobotsRules {
  /** Takes the path and query, e.g. "/news?page=2". */
  isAllowed(path: string): boolean
  /** Seconds between requests, from the non-standard Crawl-delay line. */
  crawlDelay: number | null
}

export const ALLOW_ALL: RobotsRules = { isAllowed: () => true, crawlDelay: null }

interface Group {
  agents: string[]
  rules: { allow: boolean; pattern: string }[]
  crawlDelay: number | null
}

function parseGroups(text: string) {
  const groups: Group[] = []
  let current: Group | null = null
  let readingAgents = false

  for (const rawLine of text.split(/\r\n|\r|\n/)) {
    const line = rawLine.replace(/#.*/, '').trim()
    const separator = line.indexOf(':')
    if (separator < 0) continue
    const key = line.slice(0, separator).trim().toLowerCase()
    const value = line.slice(separator + 1).trim()

    if (key === 'user-agent') {
      // Consecutive User-agent lines share one group.
      if (!readingAgents || !current) {
        current = { agents: [], rules: [], crawlDelay: null }
        groups.push(current)
      }
      current.agents.push(value.toLowerCase())
      readingAgents = true
      continue
    }
    readingAgents = false
    if (!current) continue
    // An empty Disallow allows everything, which is the same as having no rule.
    if ((key === 'allow' || key === 'disallow') && value) current.rules.push({ allow: key === 'allow', pattern: value })
    if (key === 'crawl-delay' && current.crawlDelay === null) {
      const seconds = Number(value)
      if (Number.isFinite(seconds) && seconds >= 0) current.crawlDelay = seconds
    }
  }
  return groups
}

// "*" matches any run of characters and a final "$" anchors the end, as in RFC 9309.
function patternToRegExp(pattern: string) {
  const anchored = pattern.endsWith('$')
  const body = (anchored ? pattern.slice(0, -1) : pattern)
    .split('*')
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*')
  return new RegExp(`^${body}${anchored ? '$' : ''}`)
}

/** Reads the rules for one crawler. agent is the product token, e.g. "RailBook". */
export function parseRobots(text: string, agent: string): RobotsRules {
  const groups = parseGroups(text)
  const token = agent.toLowerCase()
  const named = groups.filter(({ agents }) => agents.some((name) => name.split('/')[0] === token))
  const chosen = named.length > 0 ? named : groups.filter(({ agents }) => agents.includes('*'))
  if (chosen.length === 0) return ALLOW_ALL

  const rules = chosen
    .flatMap((group) => group.rules)
    .map(({ allow, pattern }) => ({ allow, length: pattern.length, regExp: patternToRegExp(pattern) }))

  return {
    isAllowed(path) {
      if (path === '/robots.txt') return true
      // The longest matching pattern wins, and Allow wins a tie.
      let best: { allow: boolean; length: number } | null = null
      for (const rule of rules) {
        if (!rule.regExp.test(path)) continue
        if (!best || rule.length > best.length || (rule.length === best.length && rule.allow)) best = rule
      }
      return best?.allow ?? true
    },
    crawlDelay: chosen.find((group) => group.crawlDelay !== null)?.crawlDelay ?? null,
  }
}
