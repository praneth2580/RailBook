/** Throws unless the address is an http(s) page. */
export function assertAllowed(address: string) {
  let url: URL
  try {
    url = new URL(address)
  } catch {
    throw new Error(`Not a web address: ${address}`)
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error(`Only http and https pages: ${address}`)
  return url.href
}
