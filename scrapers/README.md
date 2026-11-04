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
  selectors.ts     every selector for the site, in one place
  tasks/           one file per task
  run.ts           the command line
  core/            the framework: task context, WRAITH setup, address checks, runner, output
```

It starts empty: `site.ts` has a placeholder address and one task, `scrape`, that does nothing yet.

## Scraping your site

1. In `site.ts`, set `baseUrl` and the description.
2. Put the site's selectors in `selectors.ts`. Strings are CSS selectors, and `'a@href'` reads an attribute; `href` and `src` come back as absolute addresses. Objects take `selector`, `attr`, `list`, `transform`, `default`, `near` (the value next to a label) and nested `fields`. In an object, put the attribute in `attr`: the `@` shorthand only works in a plain string.
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

Robots.txt is respected, and requests go one at a time, at least a second apart (`minDelayMs` in `site.ts` makes the gap longer). Requests name themselves `RailBook-scrapers/0.1`, and input isn't made to look human. There are no proxies and no rotating user agents.

The browser is the installed Google Chrome. To use another Chromium-based browser, set `CHROME_PATH` to its path.

Check the site's terms before you scrape it.
