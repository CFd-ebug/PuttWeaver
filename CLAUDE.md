# PuttWeaver

A projected putt-putt hole for an annual company design challenge. A projector shows a mini game on a white plastic sheet. A camera watches the sheet and tracks a **bright yellow golf ball**. Where the ball rests, or the path it rolled, is the game input. Everything is one HTML page (HTML, CSS and JavaScript, no framework, no runtime dependencies) that runs in Chrome on an Android phone, with the phone's screen going to the projector.

Contributors each use their own Claude account on their own branch and open pull requests. Read this file before changing anything.

## Commands

```
npm install                 once (installs Playwright, used only by the tests)
npx playwright install chromium     once, unless you set CHROMIUM_PATH to an existing Chromium
npm run build               src/ -> dist/index.html (the real page) and dist/test.html (page + test hooks)
npm run check               build and only verify that both pages parse
npm test                    build, then the quick browser suite (a few minutes)
npm run test:full           also closed-loop tracking on every game, hands/heads/shadows, calibration, projector mode
npm run serve               serves dist/ at http://localhost:8080 (localhost allows camera access)
```

`dist/` is generated and git-ignored. Never edit it and never commit it. CI builds, tests and deploys `dist/index.html` to GitHub Pages on every merge to `main`. Pull request runs upload the built page as a downloadable artifact so a change can be tried on a phone.

Quick manual try without a server: open `dist/index.html` in a browser. Camera access needs HTTPS or localhost, so use the Pages site (https://cfd-ebug.github.io/PuttWeaver/) or `npm run serve` for anything involving the camera.

## Layout

```
src/template.html     page skeleton
src/styles.css        all CSS
src/body.html         all markup (toolbar, panels, dialogs)
src/js/               engine code, concatenated in filename order into one script
  00-data.js            placeholders where the map and element data are injected
  10-core.js            units, physics constants, settings, helpers
  20-content.js         quiz content (timeline events and similar)
  30-scoring.js         hole scoring helpers, per-game options
  35-games.js           placeholder: the build puts every game here, plus the GAMES list
  40-rig.js             rig state, putt/shot flow, result and hole handling
  50-loop.js            frame loop and drawing of the floor, sheet, ball
  60-input.js           mouse, touch, keyboard
  70-panel.js           the right-hand panel (scorecard, options, rankings, export)
  80-live-core.js       live camera tracking: detection, movement guard, shot state machine
  90-live-ui.js         calibration, color sampling, camera, FPS overlay, tracking panel, projector corner fit
  99-boot.js            start-up
src/games/            one file per game, plus games.json (play order)
src/data/             generated data: map.js (Natural Earth), elements.js (written by scripts/gen-elements.js)
assets/fonts/         embedded fonts and their licenses
scripts/              build.js, serve.js, gen-elements.js
tests/                Playwright scripts (see "Testing")
```

Everything is plain script concatenated into one scope, not ES modules. A top-level `const` in one file is visible in the others, so pick distinctive names. The build fails if a file does not parse.

## Rules that are easy to break

1. **No yellow and no green** in any game graphics, and none in physical decorations that could enter the camera's view of the sheet. The camera finds the ball by color, and yellow or green would read as the ball. Blues, purples, magentas, reds, white, black and gray are safe. Avoid orange, gold, lime and tan or skin tones near the ball's hue. The tracker also assumes decent contrast between ball and sheet.
2. **The page stays fully offline.** No CDN scripts, no web fonts, no `fetch` of remote resources. The build rejects `src=`/`href=`/`url()` pointing at the network, and `tests/offline-check.js` verifies no requests happen. Data goes into `src/data/` as plain JS.
3. **One file out.** The deliverable is a single self-contained `dist/index.html`.
4. **Games must be safe to play on a real sheet:** the ball can only be tracked while on the sheet, and it can roll off, so every game needs a defined result for a ball that leaves ("No reading", see `WHY` in `10-core.js`).
5. **Do not break the simulation blocks.** Code between `/*SIM*/` and `/*/SIM*/` is test-only: it is stripped from `dist/index.html` and kept in `dist/test.html`. Put desk-test helpers (like `autoPutt`) inside those markers.
6. Prefer small, reviewable pull requests. Do not reformat files you are not changing.

## Units and coordinates

Everything in the engine is in **feet and seconds**. The sheet is `W` wide and `D` deep. (0, 0) is the far-left corner, x grows to the right, y grows toward the player. `TEE` is where the ball starts. `K` (= `W / 8`) scales text and line widths with the sheet size. Distances shown to players are usually inches (`IN = 1/12`).

## Adding a game

1. Create `src/games/yourgame.js` defining a factory `function makeYourGame(){ ... return { ... }; }`. Copy `src/games/accuracy.js` (simplest) or `map.js` (a scored countdown game) as a starting point.
2. Add `{ "file": "yourgame.js", "make": "makeYourGame" }` to `src/games/games.json`. Order in that file is the order in the game list. The build refuses a game file that is not listed.
3. The game object:
   - `id`, `name`, `reads` (`'rest'` = where the ball stops, `'path'` = the rolling path, `'both'`), `tapOK` (whether the game supports the "tap the sheet where the ball should stop" input mode used for desk testing), `opts` (optional per-game settings), `how` (one sentence shown to players), `rule()` (one-sentence scoring rule).
   - `start()` resets the game. `status()` returns the short status line.
   - `drawSheet()` draws what the projector shows, in sheet feet. See the drawing helpers in `10-core.js` (`seg`, `circle`, `txt`, `pill`, `dashed`).
   - `onRest(p, why)` is called when the ball has stopped. `p` is the resting point (`{x, y}` in feet) or `null` if there is no reading, with `why` from `WHY`. Return `{ title, detail, tone }` where tone is `'good'`, `'bad'` or `''`.
   - Optional for path games: `onShotStart()` and `onSample(s, prev)` receive the ball position stream while it rolls.
   - `advance()` returns `'next'` to continue or `'over'` when the game is finished.
   - `hole()` returns `{ par, list: [{ who, strokes }], final }` so the game counts as a hole on the course; `summary()`, `card()` and `notes()` fill the panel.
   - Test-only, inside `/*SIM*/ ... /*/SIM*/`: `autoPutt()` returning `puttTo(x, y)` for the spot a perfect player would aim at.
4. **Scoring convention (every game except the Accuracy Test):** par is 3 or 4; the best score is 1 and the worst is 5, with 4 putts maximum. Helpers are in `30-scoring.js`: `countdownScore(hits)` starts at 5 and takes a stroke off per close result; "finish" games count putts to finish the goal; "versus" games let the match result set the score. Penalties may push past 5.
5. Add the game to the name list in `tests/run.js` and `tests/ui-check.js` so it is played through in CI.
6. Run `npm test`. For anything involving the ball path, also run `npm run test:full`, or at least `node tests/play-check.js "Your Game" ref x 3`.

## How the live tracking works (short version)

The camera phone and the projector are placed freely, so the tracker calibrates itself. The projector shows 13 dots; the camera finds them and fits a homography from camera pixels to sheet feet (with outlier rejection). Before each round it photographs the empty sheet. The ball is then the blob whose color ratio against that empty photo looks like a bright yellow ball, solid and ball-sized, found only inside the sheet. A movement guard ignores frames where a large share of the sheet changes (a person reaching in or walking by). A shot starts when the ball is first seen in the half of the sheet nearest the tee and moves away from it, ends when it has stayed still for a short window (`REST_WINDOW` in the simulated rig), then the round waits for the player to collect the ball before re-arming. All of this is in `80-live-core.js` and `90-live-ui.js`. Details worth knowing before editing:

- Shot starts need a strong sighting; a loose second-pass sighting can never start one.
- The frame-rate overlay (F key, or the toolbar) and "Copy report" in the tracking panel exist to debug real-rig problems. Reports from a real rig are the most useful thing to attach to an issue.
- Tracking was developed and tuned against a simulated camera (`simCam`, skin-colored moving hands, heads and shadows, noise). It has not been tuned on every phone; do not assume a change that passes the simulation works on the rig.

## Testing

Tests are Playwright scripts in `tests/`; `tests/run.js` runs them and prints a table. They load `dist/index.html` (the shipped page) or `dist/test.html` (adds `window.__lab`, defined by `TEST_HOOK` in `scripts/build.js`). Screenshots go to `tests/out/` (git-ignored). If you add something to the `__lab` hook, add it in `scripts/build.js`.

If Chromium is not installed through Playwright, set `CHROMIUM_PATH` to a Chromium/Chrome executable. Software WebGL flags are already passed where tests need them.

## Data and licenses

The project is **GPL-3.0-or-later** (`LICENSE`). Every contribution is accepted under that license.

- Only add code, data, fonts, images or text under a license compatible with GPL-3.0: public domain, CC0, MIT, BSD, Apache-2.0, the SIL OFL for fonts, or your own original work. **Do not add** anything under CC BY-SA 3.0, CC BY-NC, CC BY-ND, "no commercial use", or a proprietary or unclear license. When in doubt, ask in the pull request.
- `src/data/map.js` is derived from Natural Earth (public domain).
- `src/data/elements.js` is generated by `scripts/gen-elements.js` from plain facts (names, symbols, layout, families). Edit the script and re-run it; do not hand-edit the output, and do not paste in a published dataset.
- Fonts are SIL OFL 1.1, embedded unmodified; license texts are in `assets/fonts/`.
- Record any new third-party material in `NOTICE.md`.
- Do not add content (trivia, images, logos) you do not have the right to use. The event is a company event; keep content workplace-appropriate.

## Working with a teammate

Branch from `main`, keep one game or one fix per branch, open a pull request, and describe how to see the change. If two people need the same shared file (`10-core.js`, `40-rig.js`, `70-panel.js`, `body.html`), say so in the pull request so merges are done deliberately. Adding a game normally touches only its own file and one line in `games.json`.
