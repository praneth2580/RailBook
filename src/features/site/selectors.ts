// Every element the site helpers use goes here, grouped by page, so when the site changes its markup, this is the one
// file to fix. The app's companion site helpers (siteActions.ts) and the scrapers/ tasks both import from it.
//
// Each one is an ElementSelector (elementSelector.ts): its tag, id, classes, attributes and visible text as separate
// parts, or a whole css or xpath when the parts can't say it. Turn one into what a call needs:
// - actionSelector(element) for clicking, typing and waiting: site.act's actions, or page.click in scrapers/.
// - readField(element) for reading: site.extract, or a page's extract in scrapers/. Reading needs CSS, so an element
//   read this way can't use xpath or nth. Options go second: readField(element, { attr: 'href', list: true }).
//
// For example:
//   search: { tag: 'button', classes: ['btn', 'search_btn'], text: 'Search' }
//   from: { tag: 'input', attributes: { placeholder: 'From*' } }
//   login: { tag: 'a', text: 'LOGIN', within: { tag: 'app-header' } }
//
// An XPath's div[1] is CSS's div:nth-of-type(1), so a CSS path works both for clicking and for reading.

import type { ElementSelector } from './elementSelector'

/** The train search page, PATHS.trainSearch in urls.ts. */
export const TRAIN_SEARCH = {
  /** The menu icon in the header. */
  menu: { css: 'app-home > div:nth-of-type(1) > app-header > div:nth-of-type(1) > div:nth-of-type(2) > a > i' },
} satisfies Record<string, ElementSelector>

/** The popup that asks for a language, on the train search page. */
export const LANGUAGE_POPUP = {
  /** The popup's question. Reading it gives null when the popup isn't open. */
  prompt: { tag: 'p', text: 'Please select your preferred language.' },
  /** The button that picks English. */
  english: { tag: 'button', text: 'English' },
} satisfies Record<string, ElementSelector>

/** The side menu the header's menu icon opens. */
export const SIDE_MENU = {
  /** The menu icon in the header, which opens it. */
  menu: TRAIN_SEARCH.menu,
  /** The "Login" item. */
  login: { tag: "button" ,text: 'LOGIN / REGISTER' },
} satisfies Record<string, ElementSelector>

/** The login form that LOGIN / REGISTER opens. */
export const LOGIN_FORM = {
  /** Its username field. */
  username: { tag: 'input', attributes: { type: 'text', placeholder: 'User Name' } },
  password: { tag: 'input', attributes: { type: 'password', placeholder: 'Password' } },
  submit_btn: { tag: 'button', text: 'SIGN IN', attributes: { type: 'submit' } },
} satisfies Record<string, ElementSelector>
