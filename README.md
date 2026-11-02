# RailBook
A desktop railway booking assistant built with React, TypeScript and Node.js, designed to simplify Tatkal booking preparation, passenger management, journey planning and PNR tracking — with local-first data storage and no online backend.

## Development

Requires Node 22 and one of Google Chrome, Chromium, Microsoft Edge or Brave. If your shell runs an older Node, the npm scripts switch to the version in `.nvmrc` through nvm.

```sh
npm install
npm run dev           # open RailBook from source, with hot reload
npm test              # unit tests; the rendering tests run when a browser is installed
npm run build         # type-check and build the UI
npm run package       # build a single executable for this computer into release/
```

`npm run package -- --targets node22-win-x64,node22-macos-arm64` builds for other platforms. Windows executables are marked as GUI programs so no console opens with them; add `--console` to keep it for debugging. macOS executables need signing before they run on Apple Silicon, so build those on a Mac.

## How it runs

RailBook is a Node.js launcher and a React UI. The launcher:

1. Finds an installed Chromium-based browser. `RAILBOOK_CHROME` overrides the search.
2. Starts a server on a random port of `127.0.0.1` that serves the UI and the API (storage, page fetching and rendering, opening links).
3. Opens the UI in a Chrome `--app` window (no tabs or address bar) with a browser profile of its own, and controls it over the DevTools pipe.
4. Shuts everything down when that window closes. Opening RailBook again while it runs brings the open window forward.

Only the app window can use the server. It gets an `HttpOnly`, `SameSite=Strict` session cookie through a one-time launch link. The server refuses requests addressed to any other host name, and API calls must be JSON `POST`s, which other sites can't send without a CORS preflight.

Data lives in `~/.config/RailBook` on Linux, `~/Library/Application Support/RailBook` on macOS and `%APPDATA%\RailBook` on Windows (`RAILBOOK_DATA_DIR` overrides it): `data.json` for everything the app saves, `browser-profile/` for the window, and `railbook.log`.

`npm run package` builds the UI with Vite, bundles `desktop/main.ts` and its dependencies into one CommonJS file with every UI file embedded, and joins that to a Node runtime with [`@yao-pkg/pkg`](https://github.com/yao-pkg/pkg), the maintained fork of `pkg`.

## Structure

| Path | Purpose |
|---|---|
| `desktop` | The launcher: server, browser discovery, app window, headless renderer, data store |
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
| `src/automation` | General web scraping: polite page fetching, rendering, data extraction, multi-page jobs and change watching |
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

`src/automation` reads public web pages; it isn't tied to any one site. A job is plain JSON: start pages, steps that follow pagination or links, and the fields to extract with CSS selectors. Set `render` on a job, or pass it to `scraper.get`, to read pages after their JavaScript has run, optionally waiting for a selector. `watchJob` compares each run with the last good one and sends a notification when records are new or changed, and `runDueJobs` runs saved jobs on their schedule while the app is open.

Requests go through the launcher, so CORS doesn't apply. Rendering uses a headless browser that starts on first use and skips images, fonts and media; its User-Agent is the browser's own followed by `RailBook/0.1`. The scraper honours robots.txt (including Crawl-delay), waits at least a second between requests to the same host, and retries network errors, 429 and 5xx with backoff. Both the UI and the launcher refuse IRCTC, including after redirects.

## Limits

RailBook helps the person booking and does not book for them. It does not automate or scrape IRCTC. Login, CAPTCHA, OTP, payment and submission all happen on the official site, by hand.

Saved passenger details are stored in `data.json`, which is not encrypted.
