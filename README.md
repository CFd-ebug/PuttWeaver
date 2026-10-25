# PuttWeaver

**Play it: https://cfd-ebug.github.io/PuttWeaver/**

A projected putt-putt hole. A projector shows a mini game on a white plastic sheet; a camera watches a bright yellow golf ball. Where the ball stops, or the path it takes, decides the game. Ten games so far: Accuracy Test, Map Quest, Timeline, Periodic Table, Crowd Search, Tic-Tac-Toe, Star Sweep, Bowling, Shooting Gallery and Paint Wars. Every game except the Accuracy Test scores like a mini golf hole (par 3 or 4, best 1, worst 5).

Everything is one self-contained web page. It also runs with no network at all.

## Three roles

- **Evaluator** (the default): anyone can open the page and play the games on their own phone or laptop, then rate them. No camera or projector is needed.
- **Host**: the camera phone over the hole. It runs the ball tracking and the projection. Open it with `#host` at the end of the address, or use "Switch role" at the bottom of the page.
- **Manager**: the remote console for running the hole from another phone. On the Host tap **Add a controller**, then scan the QR code (or type the code) on the Manager phone. It can change games, restart, skip, hold the screen and pause tracking, and shows where the ball is. The Setup tab runs the camera, calibration, ball sampling and projection corners from the Manager phone, with a live camera picture. The Debug tab shows frame rates and what the tracker sees, switches the Host's overlays, tunes detection, and copies the tracking report to the Manager phone Setup and Debug stay hidden until you hold the lock button, so a stray tap during the event cannot change calibration. A Host phone keeps its screen awake and, after a restart, switches its camera and tracking back on by itself (see `docs/console-plan.md`). The Host and Manager talk through a free Firebase Realtime Database; tap **Test connection** to check it works from your network.

The role is remembered on each device.

## Try it

- **Hosted:** https://cfd-ebug.github.io/PuttWeaver/ always shows the latest `main`; it updates a few minutes after each merge. Open it on a phone in Chrome.
- **Camera tracking** needs HTTPS or `localhost`, which the hosted page and `npm run serve` both provide. Opening the file directly from storage blocks the camera.
- **Without a ball or a camera**, drag on the sheet to putt, or use the simulated camera in the tracking panel.

## Build and test

```
npm install
npx playwright install chromium     # or set CHROMIUM_PATH to an existing Chrome/Chromium
npm run build                       # writes dist/index.html
npm test                            # quick browser suite
npm run serve                       # http://localhost:8080
```

Source lives in `src/`, one file per game in `src/games/`. See `CLAUDE.md` for the layout, how to add a game, and the rules that matter (no yellow or green anywhere the camera can see, the page stays offline, scoring convention).

## Working on it with Claude

Each contributor uses their own Claude account. Work on a branch, open a pull request into `main`, and keep to one game or fix per branch. `CLAUDE.md` is what Claude reads first. A pull request's run uploads the built page as an artifact, so a change can be tried on a phone before merging. Merging to `main` publishes the site.

## License

PuttWeaver is free software under the **GNU General Public License, version 3 or (at your option) any later version**. See `LICENSE`. In short: you may use, study, change and share it, and if you distribute a modified version (including serving a modified page to other people) you must publish your changes under the same license. Contributions are accepted under the same terms. Third-party material (map data and fonts) and its licenses are listed in `NOTICE.md`.
