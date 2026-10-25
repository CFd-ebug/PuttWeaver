# Management console and roles: plan

Status: agreed design. Phases 0 (roles and landing), 1 (relay, pairing, Run tab) and 2 (Setup tab) are built; the Debug tab and the hardening are not. Written so that any contributor's Claude can build a piece of it without re-deriving the decisions. Update this file when a decision changes.

## Why

The Host phone (camera and projector) will be mounted on a ceiling. Calibration, game changes, restarts and debugging must not need that phone to be touched. A second device, the Manager, does all of it over the internet. Separately, coworkers should be able to try the games on their own phones before the hole is built.

## Decisions already made

- **Three roles**, chosen by the page address:
  - **Evaluator** (`#play`, the default): plays any game as a demo with a simulated sheet, drags to putt, rates games. No camera, projector or network needed. This is today's page with the Host-only controls hidden.
  - **Host** (`#host`): the camera phone. Tracking, projection, and publishing state. This is today's page, including its local panel.
  - **Manager** (`#manage`): the remote console.
- **Transport: Firebase Realtime Database**, used through its REST API with `fetch` and `EventSource`. No Firebase SDK, no CDN script, no auth, no server of ours. Devices never talk to each other directly.
- **Pairing by QR code plus a typed backup code**, described below.
- **The database address lives in the repo** (a config file). It is not a secret. Protection comes from the database rules and from unguessable room names, not from hiding the address.
- **The ratings and comments system is unchanged.** No shared tally and no form. Ratings stay on each device with the existing copy/export.
- The page must still work completely offline. The relay is optional and is the only permitted network use: it talks only to the configured database address.

## Defaults unless changed

- Build in phases (below) rather than all four Manager tabs at once.
- Event lock on Setup and Debug is a long-press, not a PIN.
- Several Managers may be connected at once. The Host is the single source of truth.

## Roles and landing

- Opening the plain site address opens the Evaluator view. A small "Host or Manager? Switch role" link at the bottom changes role. The choice is remembered in `localStorage`.
- Direct links: `#play`, `#host`, `#manage`. A pairing QR opens `#manage` with a code in the address (`#manage=K7M2-9QXA`).
- Implementation: resolve `ROLE` at boot. Put it on `<body>` as a class (`role-play`, `role-host`, `role-manage`) and hide Host-only markup with CSS. The Manager does not start the game engine at all. Keep the engine in one scope; do not split into ES modules.
- Evaluator hides: camera and tracking panel, projector mode, tee-view and corner-fit controls. It keeps: game list, how-to-play text, scoring, ratings and export, sheet size, speed, difficulty and skill settings (these are how a game is judged).

## Pairing

Goal: connect a Manager to a Host with a QR scan, with a typed code as backup, without exposing a permanent secret on a projected wall.

1. The Host creates a **room** the first time: a random 20-character id (100 bits, Crockford base32) stored in the Host's `localStorage`. It is never shown on screen.
2. On the Host, "Pair a remote" opens a **pairing window of about two minutes**. It generates a short **pairing code** of 8 characters (for example `K7M2-9QXA`, no `0/O/1/I/L`, case-insensitive, hyphen optional) and writes `pair/<code> = { room, exp }`.
3. The Host shows the code in large type and a QR code of `<site>/#manage=<code>`. Plain black on white with a wide quiet zone so it scans from a few feet away, even projected.
4. The Manager reads `pair/<code>`, saves the room id in its own `localStorage`, and from then on reconnects by itself. The Host deletes `pair/<code>` when the window closes or when a Manager has joined.
5. A paired Manager has "Add a controller": it asks the Host (a command) to open a new pairing window and shows the code and QR on the Manager's own screen. Only the very first pairing needs the Host's screen.
6. "Reset pairing" on the Host makes a new room id. Old Managers stop working.

The QR code needs an offline generator inside the page (no library can be added). Write a small one (byte mode, error correction L or M, mask selection), and test it by decoding its output if a decoder is available, plus a real phone scan. The typed code is the fallback when a scan fails.

## Manager screens

Phone-first, four tabs, always with a status strip: Host online or offline, camera on/off, tracking state, frame rate.

1. **Run** (default during the event): now-playing card (game, prompt, last result); buttons for next game, restart, skip round, re-arm tracking, and hold (blank sheet); a live **mini-map of the sheet** showing where the tracker thinks the ball is; hole scorecard and rankings.
2. **Games:** play order, which games are in rotation, per-game options, ratings and export.
3. **Setup:** checklist with a status mark per step: camera, fit view, calibrate, ball color, delay, test putt. "Fit view" shows a still from the camera and lets the Manager drag the four corners.
4. **Debug:** frame-rate and debug overlays, tracking tuning (method, cut, guard), a live log, "Copy report" (copies to the Manager's clipboard), and a switch for the camera preview.

**Event lock:** Setup and Debug are hidden until a long-press unlocks them, so a stray tap mid-event cannot change calibration.

**Host behavior:** the Host needs one tap on its own screen at power-up (browsers require a gesture for fullscreen; camera permission is remembered per site). It requests a screen wake lock. If the connection drops, the Host keeps running; the Manager shows "Host offline since 3:42"; nothing is queued.

## Data model (Firebase Realtime Database)

All paths are under the configured database address. Use the REST API: `PUT`/`PATCH`/`POST` with `fetch`, and `GET` with an `EventSource` for streaming (events `put`, `patch`, `keep-alive`, `cancel`, `auth_revoked`). Use server timestamps (`{".sv": "timestamp"}`) everywhere so clock differences between phones do not matter.

```
pair/<code>                    { room, exp }          written by the Host, short lived
rooms/<room>/state             Host -> Managers       snapshot, at most 2 per second and on change
rooms/<room>/cmd/<pushId>      Managers -> Host       { type, args, ts, ttl }
rooms/<room>/ack/<pushId>      Host -> Managers       { ok, error, ts }
rooms/<room>/hb/host           server timestamp, every few seconds
rooms/<room>/hb/mgr/<id>       server timestamp per Manager
rooms/<room>/want/preview      server timestamp, refreshed by a Manager while the Setup tab is open
rooms/<room>/preview           latest camera still as a data URL, about 1 per second, only while wanted
```

- `state` is small JSON: game id and name, status line, hint, mode, hole scorecard and rankings summary, tracker state and frame rate, ball position in sheet feet, setup checklist, last result, and a revision counter.
- **Commands** are executed by the Host from a command table that calls the same functions the Host's own buttons call. The table is `REMOTE_CMDS` in `src/js/95-remote-host.js`; add commands there and do not duplicate logic. A command older than its `ttl` (a few seconds) is ignored, so a restart written while the Host was offline cannot fire later. The Host acknowledges and deletes each command it handles.
- Previews are small JPEG stills. Stop sending when `want/preview` is stale.
- Keep a thin transport layer (`src/js/07-relay.js`: `relayGet/Put/Patch/Post/Delete`, `relayStream`, `relayNow`) so the database can be swapped without touching the console.

## Database rules (draft)

Paste these in the Firebase console under Realtime Database, Rules. Treat as a starting point and check them in the rules simulator before relying on them. Nothing can be listed: there is no read at `pair` or `rooms`, only at a full path under them, so a room can only be reached by knowing its id.

```json
{
  "rules": {
    ".read": false,
    ".write": false,
    "pair": {
      "$code": {
        ".read": "$code.length == 8",
        ".write": "$code.length == 8",
        ".validate": "newData.hasChildren(['room', 'exp']) && newData.child('room').isString() && newData.child('room').val().length == 20",
        "room": {},
        "exp": {},
        "$other": { ".validate": false }
      }
    },
    "rooms": {
      "$room": {
        ".read": "$room.length == 20",
        ".write": "$room.length == 20",
        "state": { ".validate": "newData.hasChildren()" },
        "cmd": { "$id": { ".validate": "newData.hasChildren(['type', 'ts'])" } },
        "ack": { "$id": { ".validate": "newData.hasChildren()" } },
        "hb": { "$who": {} },
        "want": { "$what": {} },
        "preview": { ".validate": "newData.isString() && newData.val().length < 120000" },
        "$other": { ".validate": false }
      }
    }
  }
}
```

Why the id length is checked in `.read` and `.write` and not in `.validate`: write rules apply to everything beneath a path, while validate rules only apply where they are written, so a length check in `.validate` would not stop a write to `rooms/short/state`.

**Check the rules in the Rules Playground** (Realtime Database, Rules, Rules Playground; leave "Authenticated" off; for writes choose the Set simulation type, paste the data, then Run):

| # | Type | Location | Data | Expected |
|---|---|---|---|---|
| 1 | Set | `/rooms/K7M2Q9XAB3FGHJNPRSTV/state` | `{"game":"map","rev":1}` | Allowed |
| 2 | Set | `/rooms/SHORT/state` | `{"game":"map"}` | Denied |
| 3 | Set | `/rooms/K7M2Q9XAB3FGHJNPRSTV/junk` | `{"a":1}` | Denied |
| 4 | Get | `/rooms/K7M2Q9XAB3FGHJNPRSTV/state` | | Allowed |
| 5 | Get | `/rooms` | | Denied (no listing) |
| 6 | Get | `/pair` | | Denied (no listing) |
| 7 | Set | `/pair/K7M29QXA` | `{"room":"K7M2Q9XAB3FGHJNPRSTV","exp":1}` | Allowed |
| 8 | Set | `/pair/K7M29QXA` | `{"room":"short","exp":1}` | Denied |
| 9 | Set | `/anything` | `{"a":1}` | Denied |

A "Denied" result is the rules working, not an error. The playground only runs a simulation; it does not change any data.

Limits of this design, accepted for an office event: anyone holding a room id can control that hole, and anyone who finds the database address can create junk rooms until the free quota runs out. "Reset pairing" fixes the first, replacing the database fixes the second.

## Firebase setup (done once by the repo owner)

1. At console.firebase.google.com create a project (for example `puttweaver`). Turn Google Analytics off.
2. Build, Realtime Database, Create database. Pick a region near the event. Start in locked mode.
3. Open the Rules tab, paste the rules above, and publish.
4. Copy the database address from the top of the Data tab (it looks like `https://<name>-default-rtdb.<region>.firebasedatabase.app`) and put it in `src/config.js`. No API key, no auth and no Firebase config object are needed because the page only uses the REST API with open, validated rules.
5. Stay on the free Spark plan. The traffic here (small state updates, one still per second while setting up) is far below its limits; check the current limits before the event.

A contributor who wants to test against their own project can override the address with a setting stored in `localStorage`, so the shared database is not used for experiments.

## The project's database

The shared database address is `https://puttweaver2-default-rtdb.firebaseio.com`. It is the default in `src/js/07-relay.js` (`RELAY_DEFAULT_URL`); a device can override it with `localStorage['putt-lab-relay-url']`, which is how the tests point the page at the fake database.

Claude Code cloud sessions cannot reach `firebaseio.com` (the network allowlist blocks it), so a contributor's Claude cannot test against the real project from there. Plan for that: the Playwright tests use the fake database, and phase 1 includes an in-page **relay self-test** (a button in the Host's tracking panel and the Manager's debug area that writes, reads, streams and deletes a test value and reports each step), so the project owner can confirm the real database works from a phone or laptop browser in one tap.

## Build phases

0. **Roles and landing (built).** Role resolution, Evaluator view with Host controls hidden, role links, role switch. No network. Acceptance: opening the plain address shows the Evaluator view; every game plays; no camera or projector controls are visible; the existing tests still pass.
1. **Relay, pairing and Run tab (built).** `06-qr.js`, `07-relay.js`, `08-manager.js`, `95-remote-host.js`, the Manager shell and Run tab, pairing window with QR and typed code, status strip, command expiry and acknowledgement, Host offline banner. Acceptance: pair two pages, change game, restart and skip from the Manager, watch the ball position on the mini-map, kill the Host and see the offline banner, and confirm an expired command is ignored.
2. **Setup tab (built).** Checklist (camera, corners, calibration, ball color, delay, tracking), camera still with tap-to-sample, corner handles that can be dragged or nudged.
3. **Debug tab.** Overlays, tuning, log, report copy.
4. **Hardening.** Event lock, wake lock, reconnect after reboot, per-room cleanup, docs.

## Testing

- `tests/fake-rtdb.js`: a small Node HTTP server that mimics the parts of the Realtime Database REST API in use (`GET` with and without `text/event-stream`, `PUT`, `PATCH`, `POST` push ids, `DELETE`, server timestamps). Playwright runs a Host page and a Manager page against it in CI. No real Firebase project is needed in CI.
- Test: pairing success and expiry, command round trip, command ttl, Host offline, state mirroring, and that a Manager never starts the game engine.
- A manual check against the real Firebase project is part of phase 1.
- Camera-dependent behavior (preview stills, calibration from the Manager) can only be fully verified on the real rig. Report results in the pull request.

## Open questions

- Whether any command should need a confirmation tap on the Manager (for example restart during a round).
- Whether a Manager should see a read-only view of the current game on its own screen. Not planned.

## What phase 1 built (for whoever continues)

- `src/js/06-qr.js`: offline QR encoder (byte mode, level M, versions 1 to 10). `tests/qr-decode.js` decodes its output with OpenCV.
- `src/js/07-relay.js`: REST and streaming client, server clock offset, random ids, and `relaySelfTest`, the one-tap check of a real database (button "Test connection" on the Host's pairing dialog and on the Manager).
- `src/js/08-manager.js`: the Manager console (join by code or link, status strip, Run tab, Add a controller, Unpair) and the pairing helpers the Host shares. It ends with `if (ROLE === 'manage'){ runManager(); return; }`, so the Manager never reaches the engine files after it.
- `src/js/95-remote-host.js`: the Host side. A Host only uses the network after "Add a controller" has created a room (kept in `localStorage['putt-lab-room']`). It publishes its state about twice a second **only while a Manager is connected or the pairing window is open**, writes a heartbeat every 5 s, and runs commands through `REMOTE_CMDS`. "Hold screen" is `REMOTE.hold`, drawn by `drawHold` from `drawProj`.
- Codes: 8 characters, one use, two minutes, stored at `pair/<code>`. A Manager's room and id are in `localStorage['putt-lab-mgr']`.
- `tests/fake-rtdb.js` is a stand-in database with the same rules as the real one; `tests/console-check.js` runs a Host and two Managers against it.

Not covered by any automated test, because the sandbox cannot reach `firebaseio.com`: the real database. Tap **Test connection** once from a phone to confirm it.

## What phase 2 built

- **Commands** (all in `REMOTE_CMDS`, `95-remote-host.js`): `cam` (phone or simulated camera), `camoff`, `lock` (exposure, white balance, focus), `calibrate`, `delay`, `sample` (ball in the ring), `sampleat` (tap in the picture, as fractions), `fit` (corner adjusting on or off), `pin` (one corner, as fractions of the projector screen), `pinrot`, `pinreset`. Long ones (`cam`, `lock`, `calibrate`, `delay`, `sample`) go through `remoteTask`: the command is acknowledged at once, `setup.task` names what is running, and results appear in `setup.notes`, the same text the Host's live panel shows. Only one at a time.
- **State:** `setup` (camera, calibration, corners, ball sample, delay, notes, last log lines, the sheet outline and detected ball in picture coordinates) is only included while a Manager has the Setup tab open.
- **Pictures:** the Manager writes `want/preview` every 4 s while the Setup tab is visible. The Host sends `rooms/<room>/preview` (a JPEG data URL from the camera processing canvas, about 17 kB) once a second while that timestamp is under 12 s old. Leaving the tab, or locking the phone, stops it within about 12 s.
- **Corners:** the plan said "drag corners on the still". The still cannot be used directly, because the corner handles are positions on the projector screen and the camera-to-screen mapping is unknown until after calibration. So the Manager shows a small picture of the projector screen with four handles (drag, or pick one and nudge) next to the live still, and you watch the still to see the effect. The Host's own on-screen handles still work.
- Not in the Setup tab yet: camera device and resolution pickers, exposure time and zoom sliders (they are on the Host's live panel). They fit naturally in the Debug tab or a later Setup addition.
