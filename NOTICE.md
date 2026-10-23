# Third-party material

PuttWeaver itself is licensed under the GNU General Public License, version 3 or later (see `LICENSE`). The material below is included under its own terms, all of which are compatible with that license.

| What | Where | License / source |
|---|---|---|
| World land and country borders (110m), reprojected into the game's map frame | `src/data/map.js` | [Natural Earth](https://www.naturalearthdata.com/), public domain |
| Bungee (display font) | `assets/fonts/` | SIL Open Font License 1.1, see `assets/fonts/OFL-bungee.txt` |
| Atkinson Hyperlegible (text font) | `assets/fonts/` | SIL Open Font License 1.1, see `assets/fonts/OFL-atkinsonhyperlegible.txt` |
| IBM Plex Mono (numbers) | `assets/fonts/` | SIL Open Font License 1.1, see `assets/fonts/OFL-ibmplexmono.txt` |

The fonts are embedded unmodified in the built page and keep their own license; the GPL applies to the PuttWeaver code around them.

The periodic table data (`src/data/elements.js`) is not third-party material. `scripts/gen-elements.js` writes it from facts: IUPAC element names and symbols, the standard 18-column table layout, and textbook element families. It does not copy any published dataset.
