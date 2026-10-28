# @dsquares/dev-mocks

When you test how your React app handles a failing API, you usually need the backend to fail on purpose.
This package adds a ⚙️ button to your app while the dev server runs. In that panel, you choose a request
path, for example `/api/orders/*`, and what should happen, for example "500 error" or "Delay only". After
the page reloads, every request to that path gets the answer you chose. The backend and your app code stay
unchanged.

The package is built on MSW (Mock Service Worker), a library that answers requests inside the browser
through a service worker (a background script that the browser runs between the page and the network).

The package works only on the dev server. A production build contains none of its code, see
[Production builds](#production-builds).

## What you need

- A React 18 or newer app that uses Vite or Rsbuild. Other bundlers work too, but you pass the entry file
  yourself with `--entry`.
- Node 18.17 or newer.
- npm, pnpm or yarn.
- msw 2.8 or newer. `init` installs the newest msw 2 when your repo has no msw. When your repo already has
  an older msw 2, for example 2.3 for tests, run `npm install -D "msw@^2.8.0"` first, because the panel
  uses `isCommonAssetRequest`, a function that msw added in 2.8.0.

## Quick start

In a terminal at the root of your repo, run:

```
npm install -D https://github.com/mohamed-magdy26/dev-mocks/releases/download/v0.2.0/dsquares-dev-mocks-0.2.0.tgz
npx dev-mocks init
npm run dev
```

If your app starts with `npm start`, run that instead of `npm run dev`. Then try it in the browser:

1. Open your app. A ⚙️ button appears at the bottom right of the page.
2. Click ⚙️, open the "Requests" tab, and click any API request.
3. Click the "500 error" card, then click "Save & reload".

After the reload, that request answers with status 500, and your app shows its error state.

- No ⚙️ button? See [Troubleshooting](#troubleshooting).
- To remove the package, see [Remove the setup](#remove-the-setup).

## Install

The first command above downloads the built package from the `v0.2.0` release of
[mohamed-magdy26/dev-mocks](https://github.com/mohamed-magdy26/dev-mocks), and it needs no GitHub login.
The second command, `npx dev-mocks init`, connects the package to your app. Without it, the ⚙️ button
never appears.

The first command writes that URL into `package.json`, so `npm ci` works on CI and on every other laptop,
and you can commit the change. To move to a newer version, run the same command with the new version in
both places of the URL.

## What `npx dev-mocks init` does

This walk uses a real run in a Vite 4 repo. The terminal shows these
lines. npm and MSW print their own lines between the `$` lines, and they are left out here.

```
✔ entry: src/main.tsx
$ npm install -D "msw@^2"
$ npx msw init public --save
✔ MSW worker file written to public/mockServiceWorker.js
✔ wrapped the render call in src/main.tsx:13

Done. Start your dev server. A ⚙️ button appears at the bottom right of the page.
```

| When this happens | `init` does this |
|---|---|
| `init` starts | It checks that `package.json` exists, and that no file under `src/` imports `msw/browser`. |
| It looks for the entry file | It reads `index.html` and takes the first `<script type="module" src="/src/main.tsx">`. Result: `src/main.tsx`. |
| It looks for the render call | It finds `ReactDOM.createRoot(rootElement).render(` on line 13 of `src/main.tsx`. |
| `msw` is missing from `package.json` | It runs `npm install -D "msw@^2"`. When `msw` is already listed, it skips this step. |
| `msw` is installed | It runs `npx msw init public --save`. This command copies `mockServiceWorker.js` into `public/`. It also adds `"msw": { "workerDirectory": ["public"] }` to `package.json`, so a later `msw` upgrade updates the worker file. |
| Both commands succeeded | Only now does `init` edit your source file. It adds one import and wraps the render call. |

These files change in the repo:

```
my-app/
├── package.json             ← "msw" and "@dsquares/dev-mocks" in devDependencies, and the new "msw" field
├── package-lock.json        ← updated by npm
├── public/
│   └── mockServiceWorker.js ← new file, written by MSW
└── src/
    └── main.tsx             ← one new import, and the render call is wrapped
```

This is the real change in `src/main.tsx`:

```tsx
// before
import './index.css';

const rootElement = document.getElementById('root');
// ...
ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
```

```tsx
// after
import './index.css';
import { startDevMocks } from '@dsquares/dev-mocks';

const rootElement = document.getElementById('root');
// ...
startDevMocks().then(() => {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </React.StrictMode>
  );
});
```

The app renders only after `startDevMocks()` finishes. On the dev server, `startDevMocks()` finishes
when MSW is ready, so the app's first requests already go through your rules. When MSW fails to start,
`startDevMocks()` logs an error and still finishes, so the app still renders, without mocks.

A second real run, in an Rsbuild repo, shows a different path. There,
`src/index.tsx` contains only `import "./bootstrap"`. `init` follows that import and wraps the
`root.render(...)` call on line 9 of `src/bootstrap.tsx`.

### How `init` finds the entry file

| Your repo | `init` reads |
|---|---|
| `vite` is in `package.json` | The first `<script type="module" src="...">` in `index.html`. |
| `@rsbuild/core` is in `package.json` | `source.entry` in `rsbuild.config.ts` (or `.mts`, `.js`, `.mjs`, `.cjs`). When the config has no entry, it tries `src/index.tsx`, `src/index.ts`, `src/index.jsx` and `src/index.js`, in that order. |
| Neither one | Nothing. `init` stops and asks for `--entry`. |

When the entry file has no render call, `init` checks each file that the entry file imports with a
relative path, such as `./bootstrap`. It checks one level deep only.

### Options

| Option | What it does | Example |
|---|---|---|
| `--entry <file>` | Uses this file as the entry file and skips the detection above. The path starts at the repo root. | `npx dev-mocks init --entry src/bootstrap.tsx` |
| `--public-dir <dir>` | Writes the worker file into this folder. Use the folder that your dev server serves without changes. The default is `public`. | `npx dev-mocks init --public-dir static` |
| `--help`, `-h` | Prints the usage text. | `npx dev-mocks init --help` |

Running `init` a second time is safe. When the render file already imports `@dsquares/dev-mocks`, `init`
prints `✔ src/main.tsx already calls startDevMocks()` and does not edit the file again.

## Use the ⚙️ panel

This walk is a real trial in a Vite repo, on its dev server. It makes the menu
request answer 3 seconds late, with the real server's answer.

1. In a terminal at the repo root, start your dev server, for example with `npm run dev`.
2. In the browser, open the app. In the DevTools Console tab, you see `[MSW] Mocking enabled.` At the
   bottom right of the page, you see the ⚙️ button with the number of active rules next to it.
3. On the page, click ⚙️. The "Dev Mocks" panel opens above the button. It has two tabs, "Rules" and
   "Requests".
4. In the panel, open the "Requests" tab. It lists every `fetch` and `XMLHttpRequest` call the app made,
   newest first. Click the row `GET /api/menu`. The panel switches to the "Rules" tab, and the
   "Request path" field now holds `/api/menu`.
5. In the "Rules" tab, under "What should happen", click the "Delay only" card. In the "Delay" field,
   click the `3 s` chip. The sentence under the cards now reads "A request whose path ends in
   `/api/menu` waits 3 s, then the real server answers."
6. In the panel's footer, click "Save & reload" (or press Ctrl+Enter). The page reloads, the panel stays
   open, and a message says "Rule saved. The page reloaded."
7. In the panel's "Requests" tab, the `/api/menu` row now shows the real status with a blue "delayed" tag,
   and a time of 3.06 s (3,059 ms in the trial).

The rule stays after reloads and after dev server restarts. The panel saves the rules in the browser's
localStorage under the key `dev-mocks:rules`. Each browser and each dev server address keeps its own
rules, so `localhost:5173` and `localhost:4201` do not share rules.

To change a rule, click the pencil next to it under "Active rules", then click "Update & reload". To stop
a rule, click the bin next to it. To stop every rule, click "Remove all", then click it a second time
within 3 seconds to confirm. Each of these actions reloads the page.

### The "What should happen" cards

One click on a card fills in the fields below it. Every card except "Never answers" first waits for the
"Delay" field when you fill it in.

| Card | What the request gets | Fields the card shows |
|---|---|---|
| 500 error | Status 500, body `{"message":"Internal Server Error","code":"SERVER_ERROR"}`. | Delay, Status code, Response JSON |
| Unauthorized | Status 401, body `{"message":"Unauthorized","code":"AUTH_ERROR"}`. | Delay, Status code, Response JSON |
| Not found | Status 404, body `{"message":"Resource not found","code":"NOT_FOUND"}`. | Delay, Status code, Response JSON |
| Validation | Status 422, body `{"message":"Validation failed","errors":[{"field":"name","message":"Name is required"}]}`. | Delay, Status code, Response JSON |
| Empty list | Status 200, body `{"data":[],"totalCount":0}`. | Delay, Status code, Response JSON |
| Delay only | It waits for the delay, then the real server answers. When the delay is empty or 0, it waits 3 s. | Delay |
| Network down | No response at all, like a lost connection. `fetch` rejects with `TypeError: Failed to fetch`. | Delay |
| Never answers | No response, ever. The request waits until your app's own timeout fires. Without a timeout in your app, the request waits forever. | none |

The first five cards share one form, so you can change the status code or the body after you click a card:

- In the "Status code" field, type any code from 200 to 599, or click a chip such as `403`. Then no card is
  highlighted. A browser refuses a status outside 200 to 599, so the panel keeps "Save & reload" disabled
  and says "Fix the status code first."
- When "Response JSON" is empty, the request gets the default body of its status. Status 403 gets
  `{"message":"Forbidden","code":"FORBIDDEN"}`, and every status without its own default body gets
  `{"message":"Custom response"}`.
- Statuses 204, 205 and 304 never have a body, so the panel hides the JSON box for them.
- Next to "Fill with", the buttons "Error", "Validation", "Success" and "Empty list" fill in example JSON.
  When the JSON is invalid, the panel shows the parser's error under the box and keeps "Save & reload"
  disabled with "Fix the JSON first."
- Next to "Fill with", the "Load .json file" button opens a file picker. You can also drop a `.json` file
  on the JSON box. The panel formats a file that parses. A file that does not parse goes into the box as it
  is, so the box shows the parser's error. The panel refuses a file that does not end in `.json`, and a file
  larger than 5 MB, because no rule that large fits in the browser's storage.
- When the browser refuses to store a rule, for example because the site's localStorage is full, the panel
  does not reload. The footer turns amber, says "Not saved", and gives the size of the rule. The rules
  saved before stay as they were.

### The "Requests" tab

The tab keeps the last 100 requests in the browser's sessionStorage under the key `dev-mocks:requests`,
so the list survives the reload that every rule change does. The app's own files never appear there:
scripts, styles, fonts, images, hot-reload updates, and the requests that Vite's client sends to `/` while
the dev server restarts. JSON files such as `/config/app.json` do appear,
and a rule can mock them.

| The row shows | It means |
|---|---|
| a number, such as `200` | The answer's status. Amber for 4xx and red for 5xx. A 2xx or 3xx is green when a rule answered, blue when a "Delay only" rule held it, and grey otherwise. |
| a "mocked" tag | A rule answered the request, so the real server never saw it. |
| a "delayed" tag | A "Delay only" rule held the request, then the real server answered. |
| `pending` | The request has no answer yet. |
| `no answer` | The page reloaded before the request got its answer. |
| `failed` | The request failed, for example because of a "Network down" rule. |

In the "Filter by URL" box, type part of a URL to keep only the rows that contain it. Tick "Invert" to
keep only the rows that do not contain it. The ⊘ button empties the list.

When you click a row that a rule answered with a mocked response, the panel opens that rule for editing.
When you click any other row, the panel puts the row's path into "Request path". When the request had a
query, such as `?Page=2`, the panel offers "Match only this query", which adds the query and turns on
"Match the query too".

When the real server answered that row with JSON, the click also copies the real status and the formatted
body into the form, so you can change one field and save. The panel keeps these bodies in memory only:
up to 1 MB per body and 20 MB in total, and a reload empties them. When the body is missing, the footer
says why, and only the path changes. The reasons are:

| The footer says the body | Because |
|---|---|
| is still being read | The answer is still downloading. Click the row again in a moment. |
| was empty | The answer had no body, or a status such as 204 that never has one. |
| was not JSON | The `Content-Type` header was not JSON, for example `text/html`, or the body did not parse. |
| was larger than 1 MB | The panel stopped reading at 1 MB. |
| was dropped | The panel keeps only the newest 20 MB of bodies, and this body was older. |
| was not recorded | The page reloaded after the request, or the body could not be read. |

While you type in "Request path", a list under the field suggests up to 6 recorded paths that contain your
text. Press the arrow keys and Enter, or click a suggestion.

### How a rule matches a request

A rule compares the end of the request's path, in whole segments. A segment is the text between two `/`.
The rule ignores the domain and the query. The `/` at the start of the rule is optional. You can also
paste a full URL from the DevTools Network tab, and the rule keeps only the path of that URL.

This table uses one real request, with its host replaced by the invented `api.example.com`:
`https://api.example.com/external/automated/api/v1.0/Automation/GetAllAutomations?Page=1`.
Its path is `/external/automated/api/v1.0/Automation/GetAllAutomations`.

| You type in "Request path" | Result | Why |
|---|---|---|
| `/Automation/GetAllAutomations` | match | The path ends with these two segments. |
| `automated/api/v1.0/Automation/GetAllAutomations` | match | The rule adds the missing `/` at the start. |
| The full URL, pasted from the Network tab | match | The rule keeps only the path, and the query is ignored. |
| `/Automation/*` | match | `/*` matches the `Automation` segment anywhere in the path, and every path under it. |
| `/GetAll` | no match | `GetAll` is only part of the segment `GetAllAutomations`. |
| `/Automation` | no match | The path does not end with `/Automation`. |

When you turn on the "Match the query too" switch, the query must be equal too. The rule `/Automation/GetAllAutomations?Page=1`
then matches `?Page=1`, but not `?Page=2` and not a request without a query. A rule that ends with `/*`
always ignores the query.

A short rule matches every path that ends the same way, on every domain. For example, `/Users` matches
both `/api/v1/Users` and `/admin/Users`. When you need only one of them, type more segments, such as
`/api/v1/Users`.

A rule matches every method (GET, POST, PUT, PATCH, DELETE) and both `fetch` and `XMLHttpRequest`
(which axios uses). When two rules match the same request, the rule you added last wins. Editing a rule
counts as adding it again. When you add a rule with an endpoint that an older rule already has, the new rule
takes that endpoint from the older one.

A trailing `/` does not matter: the rule `/api/users/` matches `/api/users`, and the rule `/api/users`
matches `/api/users/`. The rule `/` alone matches only the root path.

To put several paths in one rule, separate them with a comma and a space: `/api/users, /api/posts/*`.
A comma inside a query stays part of that path, so `https://host/api/products?ids=1,2,3` is one path.

## `startDevMocks()` options

You pass the options in your render file, in the call that `init` wrote.

```tsx
// Keep the call in the file, but turn the mocks off. No MSW, no ⚙️ button.
startDevMocks({ enabled: false }).then(() => { /* render */ })

// The app runs under a base path, so the dev server serves the worker file at /checkout/mockServiceWorker.js.
startDevMocks({ serviceWorkerUrl: '/checkout/mockServiceWorker.js' }).then(() => { /* render */ })
```

You need `serviceWorkerUrl` when your app runs under a base path, for example Vite's `base: '/checkout/'`.
Without it, MSW looks for `/mockServiceWorker.js` and gets a 404. Then the console shows
`[dev-mocks] Mocks are off because MSW failed to start.` and the ⚙️ button does not appear.

## Production builds

In a production build, the bundler sets `process.env.NODE_ENV` to `"production"`. Then `startDevMocks()`
returns a promise that is already finished, and the bundler removes MSW and the panel from the output.
In a real Vite build, a search of the output's `.js` files for `setupWorker`
and `dev-mocks:rules` found 0 matches.

Two things still apply to production builds:

- `public/mockServiceWorker.js` is copied into the build output, because the bundler copies every file
  in `public/`. The file does nothing there, because production never registers it.
- Your render file still imports `@dsquares/dev-mocks`, so the build machine needs devDependencies
  installed. `npm ci` installs them. `npm ci --omit=dev` does not, and the build then fails.

## Remove the setup

If you have not committed the changes, run these commands at the repo root in PowerShell. Use
`src/bootstrap.tsx` or your own render file in place of `src/main.tsx`.

```
git restore package.json package-lock.json src/main.tsx
Remove-Item public/mockServiceWorker.js
npm ci
```

If you already committed the changes, undo them by hand:

1. In your render file, delete the `import { startDevMocks } from '@dsquares/dev-mocks'` line. Then
   move the render call out of `startDevMocks().then(() => { ... })` and delete the wrapper.
2. In a terminal at the repo root, run `npm uninstall @dsquares/dev-mocks`. Also run `npm uninstall msw`,
   but only when `init` installed msw. When your repo used msw before, for example in tests, keep msw.
3. In `package.json`, delete the `"msw": { "workerDirectory": [...] }` field.
4. Delete `public/mockServiceWorker.js`.

## When `init` stops

When `init` stops, it prints a line that starts with `✖` and exits with code 1. Every stop in this list
happens before `init` edits a source file.

| The message starts with | Why `init` stopped | What you do |
|---|---|---|
| `No package.json in ...` | You ran `init` outside the repo root. | Go to the folder that holds `package.json`, and run `init` again. |
| `This repo already starts its own MSW worker in src/...` | A file under `src/` imports `msw/browser`. Two MSW workers on one page conflict. | Remove the existing MSW setup, or keep it and do not use this package. |
| `Could not find the entry file.` | The repo uses neither Vite nor Rsbuild, or the entry file has an unusual name. | Run `npx dev-mocks init --entry src/index.tsx` with your real entry file. |
| `Could not find createRoot(...).render(...) in ...` | The render call is more than one import away from the entry file, or the app uses React 17's `ReactDOM.render`. | Run `init` again with `--entry` pointing at the file that renders. Or add the two lines by hand, see below. |
| `Found 2 render calls in src/... (lines ...)` | One file renders two React roots, and `init` cannot tell which one is the app. | Add the two lines by hand, see below. |
| `Found render calls in 2 files (...)` | Two files that the entry file imports both render. | Run `init` again with `--entry` pointing at the file that renders the app, or add the lines by hand. |
| `--public-dir may only contain letters, digits, ...` | The folder name has a space or another character that `init` does not accept. | Pass a plain folder name, such as `--public-dir static`. |
| `Installing msw failed.` | npm, pnpm or yarn failed. Its own error is printed above. | Fix that error, then run `init` again. |
| `msw init failed.` | `npx msw init` failed. Its own error is printed above. msw may already be installed at this point. | Fix that error, then run `init` again. |

For the render-call stops, `init` also prints the two lines to add by hand:

```tsx
import { startDevMocks } from '@dsquares/dev-mocks'

startDevMocks().then(() => {
  // move your existing createRoot(...).render(...) call in here
})
```

When you add the lines by hand, also run `npx msw init public --save` at the repo root, so the worker
file exists.

## Known limits

- `init` indents the wrapped code with 2 spaces. A file indented with tabs ends up with mixed
  indentation. Run your formatter, for example Prettier, after `init`.
- A multi-line template string (text between backticks) inside the render call gets 2 extra spaces on each
  of its lines.
- In a file with no imports, `init` puts the new import on line 1. That is above a `'use strict'` line
  or a header comment. Move the import by hand if that matters to you.
- In a pnpm workspace, the lockfile sits at the workspace root, and `init` does not look there. `init`
  then installs msw with npm. Run `pnpm add -D "msw@^2"` first. `init` skips the install when msw is
  already in `package.json`.
- A rule matches every method. A rule only for `POST /api/orders` that leaves `GET /api/orders` alone is
  not possible yet.
- A rule cannot be paused. To turn a rule off for a while, remove it and add it again later.
- A request sent with `mode: 'no-cors'` gets an opaque answer (an answer the page is not allowed to read),
  and MSW reports no answer for it. Its row in the "Requests" tab stays `pending`, and shows `no answer`
  after the next reload.
- The panel loads its two fonts, Instrument Sans and JetBrains Mono, from Google Fonts. When your app's
  Content Security Policy blocks Google Fonts, the panel uses the system fonts instead.
- A browser lets only one service worker control a page's scope. When your app registers its own service
  worker at `/`, for example a PWA, that worker and MSW conflict. Turn your own service worker off on the
  dev server.

## Troubleshooting

**The ⚙️ button does not appear, and the console shows `[dev-mocks] Mocks are off because MSW failed to
start.`** In the browser, open `http://localhost:5173/mockServiceWorker.js`, with your own port. When the
browser shows your app's HTML or a 404 instead of JavaScript, the worker file is missing or sits at
another path. Run `npx dev-mocks init` again at the repo root. For an app under a base path, set
`serviceWorkerUrl`, see [`startDevMocks()` options](#startdevmocks-options).

**The dev server uses https with a self-signed certificate.** A browser registers a service worker only on
a page whose certificate it trusts, or on `http://localhost`. Run the dev server on plain http for local
work. In Vite 4, `npx vite --no-https` does that. On our laptops, Kaspersky Endpoint Security also
intercepts `https://localhost` and breaks it with `ERR_HTTP2_PROTOCOL_ERROR`, which is one more reason to
use http locally.

**After you upgrade msw, MSW warns that the worker file comes from a different msw version.** msw
normally updates `public/mockServiceWorker.js` with a postinstall script (a script that npm runs after it
installs a package). npm 11 can skip that script when it is not on your allowed-scripts list. Run
`npx msw init public --save` at the repo root to update the file yourself.

## For the maintainer: build the `.tgz` file

Run these commands at the root of this package.

```
npm install
npm test
npm pack
```

`npm test` runs 105 tests in 6 files. `npm pack` builds `dist/` first, then writes
`dsquares-dev-mocks-0.2.0.tgz`. The build starts with `npm run build:css`: Tailwind 3 compiles
`src/runtime/panel/panel.css` into `src/runtime/panel/styles.generated.ts`, a file git ignores. The panel
puts that CSS inside its shadow root (a separate DOM tree that your app's CSS cannot reach). The build
turns every `rem` into `px`, so the panel keeps its size even when your app changes the `<html>` font size. Raise `"version"` in `package.json` before you share a changed build, so
teammates can tell the two files apart.

To publish a version, push a tag such as `v0.2.1` from this repo. Then, on the repo's "Releases" page
on github.com, create a release from that tag and upload the `.tgz` file that `npm pack` wrote. The
install URL in the "Install" section works as soon as the file is uploaded.
