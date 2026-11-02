/** README › Limits: RailBook doesn't automate or scrape IRCTC. Subdomains are blocked too. */
export const BLOCKED_HOSTS = ['irctc.co.in']

export function isBlockedHost(hostname: string, extra: string[] = []) {
  return [...BLOCKED_HOSTS, ...extra].some((host) => hostname === host || hostname.endsWith(`.${host}`))
}
