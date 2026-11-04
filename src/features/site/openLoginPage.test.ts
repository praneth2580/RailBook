import { describe, expect, it } from 'vitest'
import { actionSelector } from './elementSelector'
import { LANGUAGE_POPUP, LOGIN_FORM, SIDE_MENU } from './selectors'
import { openLoginPage, skipLanguageModalIfPresent } from './siteActions'
import type { useSite } from './SiteProvider'

const CONFIGURED = 'https://example.com/nget/train-search'

/** A companion site that records what it's asked to do. */
function fakeSite({ url = CONFIGURED, popup = false, actError = '' } = {}) {
  const calls: [string, unknown][] = []
  let popupOpen = popup
  const site: ReturnType<typeof useSite> = {
    status: 'ready',
    info: { configuredUrl: CONFIGURED, url, title: 'Train search', headless: false },
    refresh: async () => undefined,
    extract: async <T,>(schema: object) => {
      calls.push(['extract', Object.keys(schema)])
      // A pause, so calls made together really do overlap.
      await new Promise((resolve) => setTimeout(resolve, 10))
      return { prompt: popupOpen ? 'Please select your preferred language.' : null } as T
    },
    open: async (address) => {
      calls.push(['open', address])
    },
    act: async (options) => {
      calls.push(['act', options])
      if (options.actions?.[0]?.type === 'click' && options.actions[0].selector === actionSelector(LANGUAGE_POPUP.english)) {
        popupOpen = false
      } else if (actError) {
        throw new Error(actError)
      }
    },
  }
  return { site, calls }
}

const openLogin = {
  actions: [
    { type: 'click', selector: actionSelector(SIDE_MENU.menu) },
    { type: 'click', selector: actionSelector(SIDE_MENU.login) },
  ],
  waitFor: actionSelector(LOGIN_FORM.password),
}

describe('openLoginPage', () => {
  it('opens the menu and LOGIN / REGISTER in one go, and waits for the form', async () => {
    const { site, calls } = fakeSite()
    await openLoginPage(site)
    expect(calls).toEqual([
      ['extract', ['prompt']],
      ['act', openLogin],
    ])
  })

  it('goes to the configured page first, and gets the language popup out of the way', async () => {
    const { site, calls } = fakeSite({ url: 'https://example.com/nget/profile', popup: true })
    await openLoginPage(site)
    expect(calls).toEqual([
      ['open', CONFIGURED],
      ['extract', ['prompt']],
      ['act', { actions: [{ type: 'click', selector: actionSelector(LANGUAGE_POPUP.english) }] }],
      ['act', openLogin],
    ])
  })

  it("says why when the menu has no LOGIN / REGISTER, and passes other failures on", async () => {
    const signedIn = fakeSite({ actError: 'Action 2: nothing matched button:has-text("LOGIN / REGISTER") to click.' })
    await expect(openLoginPage(signedIn.site)).rejects.toThrow("If you're signed in already")
    const slow = fakeSite({ actError: 'Nothing matched input[type="password"] in time.' })
    await expect(openLoginPage(slow.site)).rejects.toThrow('Nothing matched input[type="password"] in time.')
  })

  it("refuses before the companion website is open", async () => {
    const { site } = fakeSite()
    await expect(openLoginPage({ ...site, info: null })).rejects.toThrow("isn't open yet")
  })
})

describe('skipLanguageModalIfPresent', () => {
  it('shares one run between calls made together, so English is clicked once', async () => {
    const { site, calls } = fakeSite({ popup: true })
    expect(await Promise.all([skipLanguageModalIfPresent(site), skipLanguageModalIfPresent(site)])).toEqual([true, true])
    expect(calls.filter(([kind]) => kind === 'act')).toHaveLength(1)
    // Once it's finished, the next call looks again.
    expect(await skipLanguageModalIfPresent(site)).toBe(false)
  })
})
