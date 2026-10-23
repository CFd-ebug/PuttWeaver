# PuttWeaver

A projected putt-putt hole. A projector shows a mini game on a white plastic sheet; a camera watches a bright yellow golf ball. Where the ball stops, or the path it takes, decides the game. Ten games so far: Accuracy Test, Map Quest, Timeline, Periodic Table, Crowd Search, Tic-Tac-Toe, Star Sweep, Bowling, Shooting Gallery and Paint Wars. Every game except the Accuracy Test scores like a mini golf hole (par 3 or 4, best 1, worst 5).

Everything is one self-contained web page. It also runs with no network at all.

## Try it

- **Hosted:** the latest `main` is published with GitHub Pages (Settings, Pages shows the address). Open it on a phone in Chrome.
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
