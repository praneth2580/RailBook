import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { actionSelector, readField, type ElementSelector } from '../../src/features/site/elementSelector'
import { LANGUAGE_POPUP, SIDE_MENU, TRAIN_SEARCH } from '../../src/features/site/selectors'
import { findChrome } from '../chrome'
import { createManagedSite } from './managedSite'

// Shaped like the site where selectors.ts points, with look-alikes each selector has to tell apart. Every click
// writes where it landed into #log.
const PAGE = `<title>Train search</title>
<app-root><app-home>
  <div><app-header>
    <div><div><a data-log="wrong-link"><i>x</i></a></div><div><a href="#"><i data-log="menu">≡</i></a></div></div>
    <a data-log="header-help">Help</a>
  </app-header></div>
</app-home></app-root>
<div class="popup"><p> Please select your  preferred language. </p>
  <button data-log="hindi">हिन्दी</button><button data-log="english">English</button></div>
<ul class="side-menu"><li><a data-log="login-link">Login / Register</a></li>
  <li><span>Account</span><button data-log="login">Login / Register</button></li></ul>
<button id="1st" class="md:flex" data-log="escaped">Odd names</button>
<button data-log="book-1">Book</button><button data-log="book-2">Book</button>
<button data-log="go-back">Go back</button><button data-log="go">Go</button>
<footer><a data-log="footer-help">Help</a></footer>
<p id="log">none</p>
<script>
  document.addEventListener('click', (event) => {
    event.preventDefault()
    const target = event.target.closest('[data-log]')
    log.textContent = target ? target.dataset.log : 'missed: ' + event.target.tagName
  })
</script>`

const chrome = findChrome()
let server: Server

describe.skipIf(!chrome)('ElementSelector in a browser', { timeout: 60_000 }, () => {
  let site: ReturnType<typeof createManagedSite>

  beforeAll(async () => {
    server = createServer((_, response) => response.writeHead(200, { 'Content-Type': 'text/html' }).end(PAGE))
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    site = createManagedSite({ url: `${origin}/`, executablePath: chrome ?? '', human: 'fast' })
  })

  afterAll(async () => {
    await site.close()
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
  })

  const clicked = async (element: ElementSelector) => {
    await site.act({ actions: [{ type: 'click', selector: actionSelector(element) }] })
    return ((await site.extract({ log: '#log' })) as { log: string }).log
  }

  it("clicks selectors.ts's elements, not their look-alikes", async () => {
    expect(await clicked(TRAIN_SEARCH.menu)).toBe('menu')
    expect(await clicked(LANGUAGE_POPUP.english)).toBe('english')
    // Text alone lands on the link, not on everything around it, and case doesn't matter.
    expect(await clicked(SIDE_MENU.login)).toBe('login')
  })

  it('clicks by escaped names, by match number, within an element, by xpath and by exact text', async () => {
    expect(await clicked({ id: '1st', classes: ['md:flex'] })).toBe('escaped')
    expect(await clicked({ tag: 'button', text: 'Book', nth: 1 })).toBe('book-2')
    expect(await clicked({ tag: 'a', text: 'Help', within: { tag: 'footer' } })).toBe('footer-help')
    expect(await clicked({ xpath: '//footer/a' })).toBe('footer-help')
    expect(await clicked({ tag: 'button', text: 'Go', exactText: true })).toBe('go')
  })

  it("reads selectors.ts's elements and others", async () => {
    expect(
      await site.extract({
        prompt: readField(LANGUAGE_POPUP.prompt),
        login: readField(SIDE_MENU.login),
        help: readField({ tag: 'a', within: { tag: 'footer' } }),
        books: readField({ tag: 'button', text: 'Book' }, { list: true }),
        missing: readField({ tag: 'p', text: 'Not on this page' }),
      }),
    ).toEqual({
      prompt: 'Please select your preferred language.',
      login: 'Login / Register',
      help: 'Help',
      books: ['Book', 'Book'],
      missing: null,
    })
  })
})
