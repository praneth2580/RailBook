# RailBook
A desktop railway booking assistant built with React, TypeScript and Node.js, designed to simplify Tatkal booking preparation, passenger management, journey planning and PNR tracking — with local-first data storage and no online backend.

## Development

Requires Node 22 and one of Google Chrome, Chromium, Microsoft Edge or Brave. If your shell runs an older Node, the npm scripts switch to the version in `.nvmrc` through nvm. Scraping drives the installed browser, so there's no need for `npx playwright install`.

```sh
npm install
npm run dev           # open RailBook from source, with hot reload
npm run dev -- --headed  # the same, with the scraping browser visible
npm test              # unit and integration tests; the rendered-page tests run when a browser is installed
npm run build         # type-check and build the UI
npm run package       # build a single executable for this computer into release/
npm run scrape        # list the scraper tasks in scrapers/, or run one
```

Under `npm run dev`, Settings › Developer has a switch that shows or hides the browser WRAITH scrapes with, without a restart, and remembers the choice between dev runs. Packaged builds always keep it hidden, and leave the switch and its API out.

`RAILBOOK_SITE_URL` opens a companion website beside the app (see [Companion website](#companion-website)); `RAILBOOK_SITE_HEADED=1` shows its window. Under `npm run dev` these load from `.env` (copy `.env.example`); a packaged RailBook reads the real environment.

`npm run package -- --targets node22-win-x64,node22-macos-arm64` builds for other platforms. Windows executables are marked as GUI programs so no console opens with them; add `--console` to keep it for debugging. macOS executables need signing before they run on Apple Silicon, so build those on a Mac.

## How it runs

RailBook is a Node.js launcher and a React UI. The launcher:

1. Finds an installed Chromium-based browser. `RAILBOOK_CHROME` overrides the search.
2. Starts a server on a random port of `127.0.0.1` that serves the UI and the API (storage, page fetching and rendering, opening links).
3. Opens the UI in a Chrome `--app` window (no tabs or address bar) with a browser profile of its own, and controls it over the DevTools pipe.
4. Shuts everything down when that window closes. Opening RailBook again while it runs brings the open window forward.

Only the app window can use the server. It gets an `HttpOnly`, `SameSite=Strict` session cookie through a one-time launch link. The server refuses requests addressed to any other host name, and API calls must be JSON `POST`s, which other sites can't send without a CORS preflight.

Data lives in `~/.config/RailBook` on Linux, `~/Library/Application Support/RailBook` on macOS and `%APPDATA%\RailBook` on Windows (`RAILBOOK_DATA_DIR` overrides it): `data.json` for everything the app saves, `browser-profile/` for the window, and `railbook.log`.

`npm run package` builds the UI with Vite, bundles `desktop/main.ts` and its dependencies into one CommonJS file with every UI file embedded, and joins that to a Node runtime with [`@yao-pkg/pkg`](https://github.com/yao-pkg/pkg), the maintained fork of `pkg`. Playwright stays out of the bundle, because it reads its own files at runtime; pkg carries it as a package instead (see `"pkg"` in `package.json`). pkg's Node runtime has no inspector, which Playwright requires when it loads, so `desktop/inspector-shim.cjs` goes at the top of the bundle and stands in for it.

## Structure

| Path | Purpose |
|---|---|
| `desktop` | The launcher: server, browser discovery, app window, data store |
| `desktop/scraping` | The scraping engine: loads pages with WRAITH and serves `scrape/preview` and `scrape/run` |
| `scrapers` | A command-line framework for scraping one website with WRAITH; see its README |
| `scripts/desktop-dev.mjs` | Runs the launcher from source with Vite serving the UI |
| `scripts/package-desktop.mjs` | Builds, bundles and packages the executable |
| `src/core` | Shared types, storage, settings and formatting |
| `src/data` | Timetable and PNR data providers |
| `src/platform` | The UI's side of the launcher: API calls, alerts, clipboard, official pages |
| `src/ui` | The app shell: sidebar, command palette, dialogs, toasts, keyboard shortcuts, icons and form controls |
| `src/features/home` | Dashboard with the next booking window and quick actions |
| `src/features/tasks` | Booking tasks: list, five-step wizard, detail and the guided booking session |
| `src/features/tatkal` | Booking window rules, readiness checks, copy panel and practice runs |
| `src/features` (other) | Passengers, PNR, settings and first-run welcome screens |
| `src/automation` | Scraping jobs: the job format and its validation, pagination, detail pages, crawling, sitemaps, JSON reading and change tracking |
| `public/data/timetable.json` | Bundled timetable, empty until a dataset is chosen |

## Screens

A sidebar holds the sections, a count of active tasks and passengers, and a live countdown to the next booking window. It folds to an icon rail in narrow windows. Home is a dashboard: the next window, the tasks after it, a setup checklist, stats and recent PNRs. Tasks, passengers and PNRs are searchable lists, and deleting a passenger or PNR can be undone from the message that follows.

A booking task holds the journey, passengers, preferences and preferred payment method. Its booking session is a step pipeline: RailBook completes its own steps (pre-flight checks, waiting for the window) and the person completes every step on the official site, clicking through as they go. The session records how long each step took and saves the PNR or the reason it wasn't booked. Creating a task, running a session and practising fill the window without the sidebar, so a stray click can't leave them. The session still works when RailBook is snapped beside the browser.

Official pages open in the person's default browser, where they're already signed in. Window alerts are desktop notifications that fire while RailBook is open.

| Keys | Does |
|---|---|
| Ctrl+K (⌘K on a Mac) | Search tasks, passengers and actions |
| N | New booking task |
| 1 to 5 | Home, Booking tasks, Passengers, PNR status, Practice |
| Ctrl+, | Settings |
| / | Search the current list |
| Ctrl+Enter | Continue in the task wizard, or finish the current session step |
| ? | Show every shortcut |

## Scraping and automation

Scraping runs in the launcher on [WRAITH](https://github.com/praneth2580/WRAITH) (`wraithjs`, pinned to an exact beta). It isn't tied to any one site. A job is plain JSON:

- **Start pages**, or a sitemap whose addresses match a pattern.
- **Steps** that follow "next" links, open the detail pages a list links to, or crawl a site to a set depth, staying on it unless include and exclude patterns say otherwise.
- **Fields to extract**, in WRAITH's selector format (`'a@href'`, `{ selector, list }`, `{ near: 'Price' }`, nested fields), one record per page or per repeated element. Or read JSON: the page itself, or the responses a rendered page requested, by dot paths.
- **`render`**, to load pages in the installed Chrome and run their JavaScript first. It can click (repeatedly, for "Load more"), type, press keys, scroll for more, wait for a selector, and capture the JSON the page fetches.

The window sends jobs to `scrape/preview`, which reads only the first start page, and `scrape/run`. `src/automation/diff.ts` compares a run with the last good one, for spotting new and changed records.

### Companion website

Set `RAILBOOK_SITE_URL` and the launcher keeps that one website open beside the app for its whole run, and app code can read from and act on it. `RAILBOOK_SITE_HEADED=1` shows its browser window; otherwise it stays hidden. The page opens once the app window is up. Under `npm run dev`, Settings › Developer's "Show the scraping browser" switch reopens the companion website visible or hidden to match, without a restart.

The window reaches it through `site/info` (where the page is), `site/extract` (read the live page with a selector schema), `site/open` (navigate it to another address) and `site/act` (click, type, scroll, wait). In the app, `useSite()` ([src/features/site/SiteProvider.tsx](src/features/site/SiteProvider.tsx)) puts it in React context, with `status: 'off'` when no URL is set. The API doesn't exist when it isn't.

RailBook runs WRAITH as itself: robots.txt (including Crawl-delay) is respected, there's at least a second between requests to one site, failures are retried with backoff, and requests carry RailBook's User-Agent. Human-style input, proxies, rotating user agents and honeypot evasion stay off.

## Limits

RailBook helps the person booking and does not book for them. It does not automate or scrape IRCTC. Login, CAPTCHA, OTP, payment and submission all happen on the official site, by hand.

Tasks, passengers, PNRs and settings are stored in `data.json`, which is not encrypted.

IRCTC usernames and passwords are kept in an encrypted vault instead. Your own go in Settings › Profile, family members' in Settings › IRCTC logins, and Settings › Master password sets, unlocks and changes the encryption: AES-256-GCM, with a key derived from your master password by PBKDF2-SHA-256 at 600,000 iterations. Encryption happens in the window, so the launcher and `data.json` only see ciphertext, and the master password is never saved. Forget it and the logins can only be deleted. They unlock once per session and lock again after 15 minutes without use or when RailBook closes. RailBook only copies them for you to paste on the official site, and wipes a copied password from the clipboard after 30 seconds. It never signs in, and logins never reach the scraping engine. The browser's own password saving is off in RailBook's profile, so it keeps no second copy.
