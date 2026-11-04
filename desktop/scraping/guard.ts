import { withoutHash } from '../../src/automation/jobs'

/**
 * Checks an address RailBook is about to open. Returns it without its #fragment, or throws for an address that isn't
 * a web page.
 */
export function assertAllowedUrl(address: string): string {
  let url: URL
  try {
    url = new URL(withoutHash(address))
  } catch {
    throw new Error(`Not a web address: ${address}`)
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Only http and https pages can be opened.')
  return url.href
}
