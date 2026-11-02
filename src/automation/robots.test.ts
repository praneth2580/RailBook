import { describe, expect, it } from 'vitest'
import { parseRobots } from './robots'

describe('parseRobots', () => {
  it('prefers the group named for the crawler over the * group', () => {
    const rules = parseRobots('User-agent: *\nDisallow: /\n\nUser-agent: RailBook\nDisallow: /private', 'RailBook')
    expect(rules.isAllowed('/news')).toBe(true)
    expect(rules.isAllowed('/private/a')).toBe(false)
  })

  it('matches crawler names case-insensitively and ignores versions', () => {
    expect(parseRobots('User-agent: railbook/2.0\nDisallow: /x', 'RailBook').isAllowed('/x')).toBe(false)
  })

  it('falls back to the * group', () => {
    expect(parseRobots('User-agent: OtherBot\nAllow: /\n\nUser-agent: *\nDisallow: /', 'RailBook').isAllowed('/a')).toBe(false)
  })

  it('allows everything when no group applies', () => {
    expect(parseRobots('User-agent: OtherBot\nDisallow: /', 'RailBook').isAllowed('/a')).toBe(true)
    expect(parseRobots('', 'RailBook').isAllowed('/a')).toBe(true)
  })

  it('shares rules between consecutive User-agent lines', () => {
    expect(parseRobots('User-agent: OtherBot\nUser-agent: RailBook\nDisallow: /x', 'RailBook').isAllowed('/x')).toBe(false)
  })

  it('lets the longest match win, and Allow win a tie', () => {
    const rules = parseRobots('User-agent: *\nDisallow: /docs\nAllow: /docs/public\nAllow: /a\nDisallow: /a', 'RailBook')
    expect(rules.isAllowed('/docs/secret')).toBe(false)
    expect(rules.isAllowed('/docs/public/guide')).toBe(true)
    expect(rules.isAllowed('/a')).toBe(true)
  })

  it('supports * wildcards and $ anchors', () => {
    const rules = parseRobots('User-agent: *\nDisallow: /*.pdf$\nDisallow: /search*q=', 'RailBook')
    expect(rules.isAllowed('/files/report.pdf')).toBe(false)
    expect(rules.isAllowed('/files/report.pdf?download=1')).toBe(true)
    expect(rules.isAllowed('/search?q=trains')).toBe(false)
    expect(rules.isAllowed('/search')).toBe(true)
  })

  it('treats an empty Disallow as allowing everything', () => {
    expect(parseRobots('User-agent: *\nDisallow:', 'RailBook').isAllowed('/a')).toBe(true)
  })

  it('ignores comments', () => {
    expect(parseRobots('User-agent: * # everyone\nDisallow: /tmp # scratch', 'RailBook').isAllowed('/tmp/a')).toBe(false)
  })

  it('always allows robots.txt itself', () => {
    expect(parseRobots('User-agent: *\nDisallow: /', 'RailBook').isAllowed('/robots.txt')).toBe(true)
  })

  it('reads Crawl-delay', () => {
    expect(parseRobots('User-agent: *\nCrawl-delay: 5', 'RailBook').crawlDelay).toBe(5)
    expect(parseRobots('User-agent: *\nDisallow: /x', 'RailBook').crawlDelay).toBeNull()
  })
})
