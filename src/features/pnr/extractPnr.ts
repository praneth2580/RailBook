const LABELLED_PNR = /PNR[^0-9]{0,12}(\d{3})-?(\d{7})(?!\d)/i
const BARE_PNR = /^\s*(\d{3})-?(\d{7})\s*$/

/** Finds a PNR in pasted text. Unlabelled digits only count alone, so phone numbers aren't picked up. */
export function extractPnr(text: string): string | null {
  const match = text.match(LABELLED_PNR) ?? text.match(BARE_PNR)
  return match ? `${match[1]}${match[2]}` : null
}
