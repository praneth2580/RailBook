# Scrapers

A small framework for scraping one website and automating it in a browser with [WRAITH](https://github.com/praneth2580/WRAITH). It runs from the command line, separately from the RailBook app.

```sh
npm run scrape                                        # list the tasks
npm run scrape -- scrape                              # run a task
npm run scrape -- scrape --headed --csv --pages 2     # watch it work, save a CSV too, pass it an option
```

- `--headed` shows the browser, so you can watch a task work.
- `--csv` saves a CSV next to the JSON.
- Any other `--name value` reaches the task as `args.name`.
- Results go to `scrapers/output/<task>-<time>.json`, which git ignores.

## Layout

```
scrapers/
  site.ts          the site: its address, a description and its tasks
  tasks/           one file per task
  run.ts           the command line
  core/            the framework: task context, WRAITH setup, address checks, runner, output
```

It starts empty: `site.ts` has a placeholder address and one task, `scrape`, that does nothing yet.

## Scraping your site

1. In `site.ts`, set `baseUrl` and the description.
2. Describe the site's elements in [`src/features/site/selectors.ts`](../src/features/site/selectors.ts), which the app's companion site helpers share. Each is an `ElementSelector`: its `tag`, `id`, `classes`, `attributes` and visible `text` as separate parts, or a whole `css` or `xpath`. In a task, `actionSelector(element)` gives what `page.click` and `page.type` take, and `readField(element, { attr, list, default })` gives a field for `extract`:
   ```ts
   import { actionSelector, readField } from '../../src/features/site/elementSelector.ts'
   import { TRAIN_SEARCH } from '../../src/features/site/selectors.ts'
   ```
   Plain fields still work in `extract` too: strings are CSS selectors, and `'a@href'` reads an attribute; `href` and `src` come back as absolute addresses. Objects take `selector`, `attr`, `list`, `transform`, `default`, `near` (the value next to a label) and nested `fields`.
3. Write the task in `tasks/scrape.ts`, and add more tasks the same way, listing each one in `site.ts`. A task's `run` gets a context and returns the records to save:

| From the context | Use it for |
|---|---|
| `fetch(url)` | Pages whose data is in the HTML. Fast, with no browser. Returns a WRAITH `StaticPage`, whose `extract` runs right away. |
| `open(url)` | Pages built by JavaScript, or anything to click, type, select or scroll. Returns a WRAITH browser page, closed for you when the task ends. |
| `url(path)` | A path made absolute against `baseUrl`. `fetch` and `open` do this themselves. |
| `args` | The command line's `--name value` options. |
| `log(message)` | Progress lines. |
| `wraith` | WRAITH itself, for anything else. |

A browser page can `click`, `type`, `select`, `press`, `scroll`, `autoScroll`, `paginate`, `waitFor`, `waitForSettled` and `captureJson`. WRAITH's README covers each one.

## How every task runs

Robots.txt is respected, and requests go one at a time, at least a second apart (`minDelayMs` in `site.ts` makes the gap longer). Requests name themselves `RailBook-scrapers/0.1`, and there are no proxies and no rotating user agents. Clicks, typing and scrolling in browser pages look human, at the `human` level in `site.ts`: `fast`, `natural` (the default) or `careful`. It can't be turned off.

The browser is the installed Google Chrome. To use another Chromium-based browser, set `CHROME_PATH` to its path.

Check the site's terms before you scrape it.
