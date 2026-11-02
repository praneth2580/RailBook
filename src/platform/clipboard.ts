import { Clipboard } from '@capacitor/clipboard'

export function copyText(text: string) {
  return Clipboard.write({ string: text })
}
