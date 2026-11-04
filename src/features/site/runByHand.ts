import { loginIfNot, openLoginPage, skipLanguageModalIfPresent, loginWithTestingCredentials } from './siteActions'
import type { useSite } from './SiteProvider'

type Site = ReturnType<typeof useSite>

/**
 * Site helpers Settings › Developer lists with a Run button, to try one on the live companion page while writing it.
 * Only under npm run dev. Add a helper here to be able to run it by hand.
 */
export const RUN_BY_HAND: { name: string; run: (site: Site) => Promise<unknown> }[] = [
  { name: 'Skip the language popup', run: skipLanguageModalIfPresent },
  { name: 'Open the login page', run: openLoginPage },
  { name: 'Login with credentials', run: loginWithTestingCredentials },
]
