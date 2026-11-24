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
npm install -D https://github.com/mohamed-magdy26/dev-mocks/releases/download/v0.3.1/dsquares-dev-mocks-0.3.1.tgz
npx dev-mocks init
npm run dev
```

If your app starts with `npm start`, run that instead of `npm run dev`. Then try it in the browser:

1. Open your app. A ⚙️ tab appears on the right edge of the page, near the bottom.
2. Click ⚙️, open the "Requests" tab, and click any API request.
3. Click the "500 error" card, then click "Save & reload".

After the reload, that request answers with status 500, and your app shows its error state.

- No ⚙️ button? See [Troubleshooting](#troubleshooting).
- To remove the package, see [Remove the setup](#remove-the-setup).

## Install

The first command above downloads the built package from the `v0.3.1` release of
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

Done. Start your dev server. A ⚙️ tab appears on the right edge of the page, near the bottom.
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
2. In the browser, open the app. In the DevTools Console tab, you see `[MSW] Mocking enabled.` On the
   right edge of the page, you see the ⚙️ tab with the number of active rules under the gear.
3. On the page, click ⚙️. The "Dev Mocks" panel opens beside the tab. It has two tabs, "Rules" and
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

To change a rule, click the pencil next to it under "Active rules", then click "Update & reload". To
pause one rule without losing what it says, click the pause button next to it, described under
[Pause one rule](#pause-one-rule). To delete a rule, click the bin next to it. To delete every rule,
click "Remove all", then click it a second time within 3 seconds to confirm. Each of these actions
reloads the page.

### Pause one rule

The "Mock rules" switch in the panel's header pauses **every** rule at once. The pause button on a
rule's own row pauses **that one rule**, and leaves the others answering.

| When you do this | The panel does this |
|---|---|
| In the "Active rules" list, click the pause button on a row | The page reloads. That rule stops answering, its row turns grey and reads `paused · the real server answers`, and every other rule keeps answering. |
| Click the same button again | The page reloads and the rule answers again, with the same status, body and delay it had before. |
| Click the pencil on a paused rule, then "Update & reload" | The rule answers again. Saving an edit always resumes a rule, because the page reloads straight afterwards and you would otherwise see no change. |
| Click the bin on a paused rule | The rule is deleted, exactly as for a live rule. |

Pausing never changes which of your other rules answers a request, because the panel picks the most
specific matching rule rather than the newest one. The panel stores the flag inside the rule itself, in
`dev-mocks:rules`, as `"paused": true`.

**An invented example**, because this repo has no saved case to quote. You have two rules:

1. `GET /api/orders` answers 500.
2. `POST /api/orders` answers 422 with field errors.

You want the 500 off for ten minutes while you work on the form.

| Step | What you see |
|---|---|
| You click the pause button on the `GET /api/orders` row | The page reloads. The row is grey and reads `paused · the real server answers`. |
| The app calls `GET /api/orders` | The real server answers with your five orders. |
| The app calls `POST /api/orders` | Still 422. That rule was never touched. |
| You look at the panel's header | It reads `1 of 2 rules active`, and the ⚙️ tab's badge reads `1`. The "Active rules" tab badge still reads `2`, because two rules are saved. |
| You reload the page yourself | The rule is still paused. The flag is saved with the rule. |
| You click the pause button again | The page reloads and `GET /api/orders` answers 500 again. |

When every saved rule is paused one by one, the header reads `2 rules paused`, the same line the
"Mock rules" switch produces, and the ⚙️ tab's bar shows the amber split bar.

### Move, shrink and pause the ⚙️ tab

The ⚙️ tab can cover part of your app, so the panel lets you move it, shrink it and pause its rules.
The panel saves each choice in the browser's localStorage, so the choice stays after a reload.

| When you do this | The panel does this |
|---|---|
| On the page, drag ⚙️ and let go | The tab sticks to whichever of the four screen edges you let go nearest, at the place along that edge where you let go. On the left and right edges it stands upright and slides up and down; on the top and bottom edges it lies flat and slides left and right. The panel saves the place under `dev-mocks:spot`, as a line such as `right:0.820`. |
| With ⚙️ in keyboard focus, press an arrow key | The tab slides a twentieth of the screen along its own edge. Up and down work on the left and right edges, left and right on the top and bottom edges. This is the way to move it without a mouse. |
| In the panel's header, click the four-arrow button | The tab moves to the next edge, clockwise: right, bottom, left, top. It keeps its place along the edge. |
| In the panel's header, click the arrows folding inwards | The panel closes and the ⚙️ tab shrinks to a thin bar on the edge. The panel saves `dev-mocks:hidden`, which keeps the name the setting had in 0.3.0, so a developer who already shrank the tab keeps that choice after upgrading. |
| Anywhere on the page, press Alt+Shift+M | The panel opens, or closes when it was open. The ⚙️ tab stays as it is, shrunk or not. |
| Anywhere on the page, press Alt+Shift+H | The ⚙️ tab shrinks to the bar, or comes back when it was shrunk. |
| In the panel's header, turn off the "Mock rules" switch | The page reloads. Every request goes to the real server, and the rules stay in the list. Turn the switch on again to use them. The panel saves `dev-mocks:paused`. "Remove all" also turns the switch back on. |
| Keep the mouse away from ⚙️ | The tab turns 25% transparent, and 6 px of it slides behind the screen edge. It turns solid and slides out when the mouse comes within 96 px of it, when the panel is open, or when the tab has keyboard focus. |

A spot saved by 0.3.0, which had four corners and no edges, is read once as the same side of the
screen: `bottom-right`, for example, becomes the right edge near the bottom.

While the tab is shrunk, a thin bar stays on the screen edge where the tab was. It stands on end
against a left or right edge and lies flat against a top or bottom edge. The bar has a different
shape and colour in each state, so the state is readable without colour:

| State | The bar looks like this |
|---|---|
| The rules mock requests | A solid lime bar, which blinks 3 times after the page loads. |
| The rules are paused | An amber bar split in two, like a pause sign. |
| There is no rule | A short grey stub. |

**One click on that bar opens the panel**, and a second click closes it again. The ⚙️ tab stays
shrunk either way, so the app keeps the quiet edge you gave it. To bring the ⚙️ tab itself back,
press Alt+Shift+H. Hover the bar to read "2 rules active · click to open dev mocks · drag to move ·
Alt+Shift+H brings the ⚙️ tab back" (or "2 rules paused · …", or "0 rules · …").

The bar drags to another edge exactly like the ⚙️ tab, and the arrow keys slide it along its own
edge, so you never have to bring the tab back just to move it out of the way. Its clickable box is
small on purpose: 28 px by 10 px, a quarter of the area the old hidden button took, because whatever
your app draws under that strip of the edge has to stay within reach of the mouse.

The panel opens 44 px in from the screen edge, which clears the 36 px ⚙️ tab. While the tab is
shrunk it opens 20 px in instead, close against the 10 px bar that opened it.

Two things changed in 0.3.1. The default shortcut moved from Alt+Shift+D to Alt+Shift+M, because the
Dark Reader browser extension uses Alt+Shift+D. Alt+Shift+M then stopped hiding the tab and started
opening and closing the panel, which is the thing you reach for most, and shrinking the tab moved to
Alt+Shift+H.

While the tab is shrunk, the DevTools Console tab shows one line on every page load, so you can always
find the way back:

```
[dev-mocks] 2 rules active. The ⚙️ tab is shrunk to a bar on the screen edge. Click the bar to open the panel, or press Alt+Shift+H to bring the tab back.
```

With no rule, the line leaves the count out and starts at "The ⚙️ tab is shrunk".

Alt+Shift+M matches the M key by its place on the keyboard, so the shortcut also works while your keyboard
types Arabic. To pick another shortcut, see [`startDevMocks()` options](#startdevmocks-options).

A browser extension can use the same shortcut, and then the browser gives the key press to the extension
before the page sees it. In Chrome, open `chrome://extensions/shortcuts` to see the shortcuts of your
extensions. When one of them uses Alt+Shift+M, change that extension's shortcut there, or pick another
shortcut for the panel.

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

### Narrow a rule to one kind of body

`POST /api/orders` sends many orders, and usually you want only one of them to fail. The
"Match on the request body" pair of boxes does that. "Field" takes the name of a field in the request's
JSON body, and "Value" takes what it must hold.

| When this happens | The rule does this |
|---|---|
| Both boxes are empty | The rule answers every body, which is how a rule with no body match behaves |
| Field `coupon`, Value `EXPIRED` | It answers a request whose body is `{"coupon": "EXPIRED"}`, and leaves every other coupon to the real server |
| Field `user.role`, Value `admin` | A dot reaches inside a nested field: `{"user": {"role": "admin"}}` |
| The request's body is not JSON | It never matches, so the request goes to the real server |
| One box is filled and the other is empty | The panel shows an error under the boxes and keeps "Save & reload" disabled |

The value is compared as text, and spaces around it are dropped. The "Clear" button beside the label
empties both boxes at once. In the rule's row in the "Active rules" tab, a body match reads as
`· body coupon = EXPIRED` after the delay.

### Answer differently after the first calls

A retry is hard to test when a rule always answers the same way. The switch "Answer differently after
the first calls" splits one rule's answer in two.

Here is one rule, with the 500 card clicked, the count set to 2, and "Every call after that gets" set
to "The real server". Walk one page through it:

| The app's call | What it gets | The rule's row in "Active rules" says |
|---|---|---|
| 1st `GET /api/orders` | Status 500, so your retry code runs | `1 of 2 calls used` |
| 2nd call | Status 500 again | `2 of 2 calls used · answering the real server now` (in amber) |
| 3rd call | The real server's own answer | the same amber line |
| You reload the page | Status 500 again, because the count starts over | `1 of 2 calls used` |

The count field takes 1 or more, with chips for 1, 2 and 3 beside it. "Every call after that gets" has
two choices: "A status code", which opens its own status and JSON boxes, or "The real server", which
stops the rule answering at all once the first calls are used.

Two things to know before you trust the count. Every request counts, including the ones you do not see:
in development React runs an effect twice, so a page that fetches inside an effect sends two requests and
one page load spends two calls. And the count lives only in the open page, never in storage, so every
reload starts it again at the 1st call.

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
`https://api.example.com/external/shop/api/v1.0/Order/GetAllOrders?Page=1`.
Its path is `/external/shop/api/v1.0/Order/GetAllOrders`.

| You type in "Request path" | Result | Why |
|---|---|---|
| `/Order/GetAllOrders` | match | The path ends with these two segments. |
| `shop/api/v1.0/Order/GetAllOrders` | match | The rule adds the missing `/` at the start. |
| The full URL, pasted from the Network tab | match | The rule keeps only the path, and the query is ignored. |
| `/Order/*` | match | `/*` matches the `Order` segment anywhere in the path, and every path under it. |
| `/GetAll` | no match | `GetAll` is only part of the segment `GetAllOrders`. |
| `/Order` | no match | The path does not end with `/Order`. |

When you turn on the "Match the query too" switch, the query must be equal too. The rule `/Order/GetAllOrders?Page=1`
then matches `?Page=1`, but not `?Page=2` and not a request without a query. A rule that ends with `/*`
always ignores the query.

A short rule matches every path that ends the same way, on every domain. For example, `/Users` matches
both `/api/v1/Users` and `/admin/Users`. When you need only one of them, type more segments, such as
`/api/v1/Users`.

The box to the left of "Request path" picks the method. It starts on "Any", so the rule answers GET, POST,
PUT, PATCH and DELETE alike. Pick one method and the rule answers that one only, which lets
`GET /api/orders` and `POST /api/orders` be two rules with two different answers. A rule clicked in from
the "Requests" tab arrives with the method that request used, already picked. Either way the rule answers
both `fetch` and `XMLHttpRequest`, which is what axios uses.

### Which rule answers when two of them match

When two rules match the same request, the more specific of the two answers it. The order you saved them
in does not matter. The panel compares the two rules test by test, in this order, and the first test that
tells them apart decides it:

| | The more specific rule | The less specific rule |
|---|---|---|
| 1. The path's length | more named parts, `/api/v1/Users` | fewer, `/Users`. The `*` of a `/*` path is not a named part |
| 2. The path's shape | names its last part, `/api/orders` | ends in `/*`, so it covers everything below |
| 3. The query | has "Match the full URL" on | answers any query |
| 4. The body | answers one field and value only | answers any body |
| 5. The method | answers GET only, or POST only | answers any method |
| 6. The server | answers one origin only | answers every origin |
| 7. Still equal | the rule you saved last | the older one |

The "Active rules" list is drawn in that same order, most specific at the top. The list has no request to
rank against, so it ranks a rule that holds several paths by the most specific of them. A rule holding
`/api/v1/deep/orders` and `/cart/*` is therefore placed by its first path, and can sit above a rule that
beats it on a request to `/cart`.

**An invented example**, because this repo has no saved case to quote. You save two rules on the same path:

1. `GET /api/orders` answers 404. It has no query condition.
2. `GET /api/orders?reload=0` answers 500, with "Match the full URL" on.

| The app requests | Which rule answers | Why |
|---|---|---|
| `/api/orders?reload=0` | the 500 rule | Both match, and test 3 separates them: the 500 rule pins the query. |
| `/api/orders` | the 404 rule | The 500 rule needs the query `?reload=0`, so it does not match at all. |
| `/api/orders?reload=1` | the 404 rule | Same reason: the query is not the one the 500 rule pinned. |

Saving the rules the other way round changes nothing, and neither does editing one of them.

When you add a rule with an endpoint that an older rule already has, the new rule takes that endpoint from
the older one. Two rules that differ only by method do not take endpoints from each other, because they
never answer the same request.

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

// A browser extension already uses Alt+Shift+M, so Ctrl+Alt+K opens and closes the panel instead.
startDevMocks({ shortcut: 'Ctrl+Alt+K' }).then(() => { /* render */ })

// And Ctrl+Alt+J shrinks the ⚙️ tab to the screen edge, in place of Alt+Shift+H.
startDevMocks({ shortcut: 'Ctrl+Alt+K', shrinkShortcut: 'Ctrl+Alt+J' }).then(() => { /* render */ })
```

You need `serviceWorkerUrl` when your app runs under a base path, for example Vite's `base: '/checkout/'`.
Without it, MSW looks for `/mockServiceWorker.js` and gets a 404. Then the console shows
`[dev-mocks] Mocks are off because MSW failed to start.` and the ⚙️ button does not appear.

`shortcut` opens the panel and closes it again, and `shrinkShortcut` shrinks the ⚙️ tab to a bar on the
screen edge and brings it back. Both are written the same way, and both are optional: the defaults are
Alt+Shift+M and Alt+Shift+H. Give the two of them different keys. If both end up on the same keys, that
key opens and closes the panel, nothing shrinks the ⚙️ tab, and the console shows
`[dev-mocks] Both shortcuts are Alt+Shift+H, so that key opens and closes the panel and nothing shrinks the ⚙️ tab.`

Each one joins one or more of `Ctrl`, `Alt`, `Shift` and `Meta` with `+` to one letter, one digit, or
one of `F1` to `F12`. `Meta` is the ⌘ key on a Mac. The shortcut needs at least `Ctrl`, `Alt` or `Meta`,
so that typing in a text field never fires it. When the text breaks these rules, for example `'Shift+D'`,
the console shows `[dev-mocks] The shortcut "Shift+D" is not valid, so Alt+Shift+M is used.` and the
panel keeps Alt+Shift+M. You can also write `Option` for `Alt`, `Control` for `Ctrl`, and `Cmd` or
`Command` for `Meta`. On Windows, AltGr never fires the shortcut, because AltGr types characters. On a
Mac, Option+Shift+M types `Â` in a text field, and the panel takes that key press for the shortcut.

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

- In a file with no imports, `init` puts the new import on line 1. That is above a `'use strict'` line
  or a header comment. Move the import by hand if that matters to you.
- In a pnpm workspace, the lockfile sits at the workspace root, and `init` does not look there. `init`
  then installs msw with npm. Run `pnpm add -D "msw@^2"` first. `init` skips the install when msw is
  already in `package.json`.
- A request sent with `mode: 'no-cors'` gets an opaque answer (an answer the page is not allowed to read),
  and MSW reports no answer for it. Its row in the "Requests" tab stays `pending`, and shows `no answer`
  after the next reload.
- The panel loads its two fonts, Instrument Sans and JetBrains Mono, from Google Fonts. When your app's
  Content Security Policy blocks Google Fonts, the panel uses the system fonts instead.
- A browser lets only one service worker control a page's scope. When your app registers its own service
  worker at `/`, for example a PWA, that worker and MSW get in each other's way. Read
  [If your app registers its own service worker](#if-your-app-registers-its-own-service-worker-a-pwa).

## If your app registers its own service worker (a PWA)

Read this section only when your own app calls `navigator.serviceWorker.register(...)`. A PWA does
that, and so does an offline cache or a push-notification worker. When your app never calls it, nothing
here can happen to you, and you can skip to [Troubleshooting](#troubleshooting).

**Nobody on this team has tried this yet.** Everything below is read from the browser rules and from
MSW's own code, not from a dev server we ran with a PWA in it. The last part of this section,
[What to report back](#what-to-report-back), says exactly what we need to hear from you.

### Why the two workers get in each other's way

A service worker is a small script the browser keeps running next to your page. It sees every request
the page sends, and it may answer a request itself. That is how a PWA works offline, and it is also how
dev-mocks puts a fake answer in front of your app.

The browser gives one path, called the scope, to exactly one service worker. A page at
`http://localhost:5173/orders` is inside the scope `/`. Two scripts cannot both hold `/`, so the second
one to register takes the scope from the first.

Both of these register at `/` on your dev server:

| Who registers | Which file | When |
| --- | --- | --- |
| MSW, started by `startDevMocks()` | `/mockServiceWorker.js` | every page load, inside `startDevMocks()` |
| Your app | usually `/sw.js` or `/service-worker.js` | wherever your app calls `register()` |

So on every page load the two race, and the one that registers last controls the page:

| When this happens | The browser does this |
| --- | --- |
| Your app registers `/sw.js` after `startDevMocks()` finished | `/sw.js` takes the scope `/`. Your rules stop answering. The ⚙️ panel still opens and still lists the rules, which is why this is confusing. |
| `startDevMocks()` registers after your app did | `/mockServiceWorker.js` takes the scope `/`. Your rules answer, and whatever your own worker did, for example serving a cached page offline, stops. |
| Nobody reloads, and a worker is already installed from an earlier visit | The installed worker keeps control until the page is reloaded. The symptom can therefore survive the change you just made. |

### What you would see

- The ⚙️ tab appears, the rule is in the list, the rule says `500`, and the request still comes back
  `200` from the real server.
- The "Requests" tab shows the request, labelled as not mocked.
- Or the opposite: mocking works, and your app's offline behaviour stops working on the dev server.
- The console may show `[dev-mocks] Mocks are off because MSW failed to start.` That line means MSW
  never got its worker registered at all.

### Check which worker is in control

1. In Chrome, open DevTools with F12.
2. In DevTools, open the "Application" tab.
3. In the Application tab's left sidebar, click "Service workers".
4. Read the "Source" line of the worker marked `#NNNN activated and is running`. When it names
   `mockServiceWorker.js`, MSW holds the page. When it names your own file, for example `sw.js`, your
   app holds the page.

### Turn your own worker off on the dev server

Keep the worker in production, and stop registering it while you develop. Pick the one line below that
matches how your app registers it. All three examples are invented, because this repository has no PWA
in it.

**vite-plugin-pwa.** In `vite.config.ts` at the repo root, the plugin has a `devOptions` block. Set
`enabled` to `false` there, which is also the default:

```ts
VitePWA({
  devOptions: { enabled: false },
})
```

**Create React App.** In `src/index.tsx`, the file calls either `serviceWorker.register()` or
`serviceWorkerRegistration.register()`. Change that one call to `unregister()`, which CRA also ships:

```ts
serviceWorkerRegistration.unregister()
```

**A `register()` call you wrote yourself.** Wherever that call sits, put it behind the mode check, so it
runs in a production build only:

```ts
if (process.env.NODE_ENV !== 'development') {
  void navigator.serviceWorker.register('/sw.js')
}
```

### Remove a worker that is already installed

Turning the registration off stops new installs. A worker installed on an earlier visit stays until you
remove it.

1. In DevTools, open the "Application" tab, then "Service workers" in its left sidebar.
2. Next to your own worker, click "Unregister".
3. Reload the page.

When you would rather do it in code, paste this in the DevTools "Console" tab, read what it prints, and
reload:

```js
navigator.serviceWorker.getRegistrations().then((list) => {
  list.forEach((reg) => {
    console.log('removing', reg.active?.scriptURL)
    void reg.unregister()
  })
})
```

### What we have not built

MSW can also mock without a service worker at all, by patching `fetch` and `XMLHttpRequest` in the page.
MSW picks that path only when the browser has no service worker support, and version 2.15.0 offers no
option to ask for it. So dev-mocks cannot offer it either today.

MSW does expose one more escape hatch, an option called `findWorker`, which lets a project keep its own
worker and load MSW's script inside it with `importScripts('/mockServiceWorker.js')`. `startDevMocks()`
does not pass that option through today. If your report back says you need it, it is a small change to
`src/runtime/start.ts` and we can add it.

### What to report back

Please write down these five things and send them over.

1. How your app registers its worker: the plugin or the file and line that calls `register()`.
2. What the DevTools "Service workers" panel shows while your dev server runs, before you change
   anything: which script is `activated and is running`.
3. Whether a rule in the ⚙️ panel answers a request at that moment. Add a `500` rule on one endpoint,
   reload, and say what status came back.
4. What happens after you turn your own registration off and unregister the old worker: does the rule
   answer then?
5. Whether anything about your app breaks on the dev server with your worker off, for example a page
   your app serves from its cache.

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

`npm test` runs 219 tests in 7 files. `npm pack` builds `dist/` first, then writes
`dsquares-dev-mocks-0.3.1.tgz`. The build starts with `npm run build:css`: Tailwind 3 compiles
`src/runtime/panel/panel.css` into `src/runtime/panel/styles.generated.ts`, a file git ignores. The panel
puts that CSS inside its shadow root (a separate DOM tree that your app's CSS cannot reach). The build
turns every `rem` into `px`, so the panel keeps its size even when your app changes the `<html>` font size. Raise `"version"` in `package.json` before you share a changed build, so
teammates can tell the two files apart.

### Try the panel in the example app

The `example/` folder holds a small invented shop page. Its dev server answers `GET /api/orders` and
`GET /api/orders/:id` with invented orders after a 300 ms wait, so the panel has real requests to mock or let
through. You start it in one of two ways, at the root of this package:

| Command | What runs | Port | Use it |
|---|---|---|---|
| `npm run example` | The page imports the package from `src/`. When you save a file in `src/`, the page reloads. When you save a panel file, the panel CSS is rebuilt first. | 5173 | Every day, while you change the package. |
| `npm run example:packed` | The script runs `npm pack`, copies `example/` into `.example-packed/`, installs the new `.tgz` there, and runs `npx dev-mocks init` on that copy. Then Vite starts the copy. | 5174 | Before a release, to prove that the `.tgz` installs and that `init` works. |

`example/src/main.tsx` stays a plain render call on disk, which is how an app looks before `init`. In the
first mode, a Vite plugin in `example/vite.config.ts` wraps that call in `startDevMocks()` in memory. In
the second mode, `init` wraps the call in the copy, the same way it does in a real app. Git ignores
`.example-packed/`.

To publish a version, push a tag such as `v0.2.1` from this repo. Then, on the repo's "Releases" page
on github.com, create a release from that tag and upload the `.tgz` file that `npm pack` wrote. The
install URL in the "Install" section works as soon as the file is uploaded.

Never replace the `.tgz` file of a release that someone has installed. When a teammate installs the
package, their `package-lock.json` stores a hash of the file in its `integrity` field. If the file at the
same URL changes later, `npm ci` on their laptop or CI downloads a file with a different hash and stops
with an `EINTEGRITY` error. Publish every change under a new version number instead, with a new tag and
a new release.
