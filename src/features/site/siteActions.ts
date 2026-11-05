import { actionSelector, readField } from './elementSelector'
import { LANGUAGE_POPUP, LOGIN_FORM, SIDE_MENU } from './selectors'
import type { useSite } from './SiteProvider'
import { PATHS, pathOf } from './urls'

type Site = ReturnType<typeof useSite>

/**
 * Helpers that run on their own when the companion page arrives at a path, on any domain. SiteAutomations watches
 * the page and runs them; add an entry here to run another helper when its page loads.
 */
export const ON_PAGE_LOAD: { path: string; run: (site: Site) => Promise<unknown> }[] = [
  { path: PATHS.trainSearch, run: skipLanguageModalIfPresent },
]

/** The helpers for the page at this address. A trailing slash, the query and the #fragment don't matter. */
export function helpersForPage(address: string) {
  const path = pathOf(address)
  return ON_PAGE_LOAD.filter((entry) => entry.path === path).map((entry) => entry.run)
}

let skipping: Promise<boolean> | null = null

/**
 * Picks English when the site asks for a language, to get the popup out of the way. Says whether it was there. A call
 * made while one is running shares it, so SiteAutomations and another helper can't both try to click English.
 */
export function skipLanguageModalIfPresent(site: Site): Promise<boolean> {
  skipping ??= (async () => {
    const { prompt } = await site.extract<{ prompt: string | null }>({
      prompt: readField(LANGUAGE_POPUP.prompt),
    })
    if (!prompt) return false
    // A click waits for the page to settle afterwards, so there's nothing more to wait for.
    await site.act({ actions: [{ type: 'click', selector: actionSelector(LANGUAGE_POPUP.english) }] })
    return true
  })().finally(() => {
    skipping = null
  })
  return skipping
}

/**
 * Opens the login form from the side menu, going to the configured page (RAILBOOK_SITE_URL) first when the companion
 * page is somewhere else. Done once the form's password field is showing; signing in is left to the person.
 */
export async function openLoginPage(site: Site) {
  const configuredUrl = site.info?.configuredUrl
  if (!configuredUrl) throw new Error("The companion website isn't open yet.")
  if (!site.info?.url.startsWith(configuredUrl)) await site.open(configuredUrl)

  // The language popup covers the page, so the menu can't be clicked until it's gone.
  await skipLanguageModalIfPresent(site)

  try {
    await site.act({
      actions: [
        { type: 'click', selector: actionSelector(SIDE_MENU.menu) },
        { type: 'click', selector: actionSelector(SIDE_MENU.login) },
      ],
      waitFor: actionSelector(LOGIN_FORM.password),
    })
  } catch (error) {
    // Action 2 is the LOGIN / REGISTER click, and the menu leaves it out once someone is signed in.
    if (error instanceof Error && error.message.startsWith('Action 2: nothing matched')) {
      throw new Error("The menu has no LOGIN / REGISTER. If you're signed in already, there's no login form to open.")
    }
    throw error
  }
}

/**
 * Opens the login form from the side menu, going to the configured page (RAILBOOK_SITE_URL) first when the companion
 * page is somewhere else. Done once the form's password field is showing; signing in is left to the person.
 */
export async function checkIfLoggedIn(site: Site) {
  const configuredUrl = site.info?.configuredUrl
  if (!configuredUrl) throw new Error("The companion website isn't open yet.")
  if (!site.info?.url.startsWith(configuredUrl)) await site.open(configuredUrl)

  // The language popup covers the page, so the menu can't be clicked until it's gone.
  await skipLanguageModalIfPresent(site)

  try {
    await site.act({
      actions: [
        { type: 'click', selector: actionSelector(SIDE_MENU.menu) },
        { type: 'click', selector: actionSelector(SIDE_MENU.login) },
      ],
      waitFor: actionSelector(LOGIN_FORM.password),
    })
  } catch (error) {
    // Action 2 is the LOGIN / REGISTER click, and the menu leaves it out once someone is signed in.
    if (error instanceof Error && error.message.startsWith('Action 2: nothing matched')) {
      throw new Error("The menu has no LOGIN / REGISTER. If you're signed in already, there's no login form to open.")
    }
    throw error
  }
}


/**
 * Opens the login form from the side menu, going to the configured page (RAILBOOK_SITE_URL) first when the companion
 * page is somewhere else. Done once the form's password field is showing; signing in is left to the person. Throws if
 * the menu has no LOGIN / REGISTER, which happens when someone is signed in already.
 */
export async function loginIfNot(site: Site, username: string, password: string) {
  const configuredUrl = site.info?.configuredUrl
  if (!configuredUrl) throw new Error("The companion website isn't open yet.")
  if (!site.info?.url.startsWith(configuredUrl)) await site.open(configuredUrl)

  // The language popup covers the page, so the menu can't be clicked until it's gone.
  await skipLanguageModalIfPresent(site)

  try {
    await site.act({
      actions: [
        {type: 'type', text: username, selector: actionSelector(LOGIN_FORM.username)},
        {type: 'type', text: password, selector: actionSelector(LOGIN_FORM.password)},
        { type: 'click', selector: actionSelector(LOGIN_FORM.submit_btn) },
      ],
    })
  } catch (error) {
    // Action 2 is the LOGIN / REGISTER click, and the menu leaves it out once someone is signed in.
    if (error instanceof Error && error.message.startsWith('Action 2: nothing matched')) {
      throw new Error("The menu has no LOGIN / REGISTER. If you're signed in already, there's no login form to open.")
    }
    throw error
  }
}

export async function loginWithTestingCredentials(site: Site) {
  // Only npm run dev provides these (see scripts/desktop-dev.mjs); a built app has neither.
  const username: string | undefined = import.meta.env.IRCTC_LOGIN_USERNAME
  const password: string | undefined = import.meta.env.IRCTC_LOGIN_PASSWORD
  console.log('Logging in with testing credentials', { username })
  if (!username || !password) throw new Error('Set IRCTC_LOGIN_USERNAME and IRCTC_LOGIN_PASSWORD in .env.local, then restart npm run dev.')

  await loginIfNot(site, username, password);
    
}