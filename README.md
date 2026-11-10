# Note by Note

A browser practice stand for a beginner with a MIDI keyboard. The program is licensed under the **GNU Affero General Public License v3.0 or later** (`LICENSE`). Third-party scores and libraries are listed in `THIRD_PARTY.md`. The window is a tab bar:

- **练习 Practice** — pick a piece from the library, then play it in Wait or Rhythm mode. `#library` opens the same tab with the picker showing.
- **训练 Training** — sight-reading and rhythm drills. `#sight` opens this tab.
- **识谱 OMR** — turn a photo or a multi-page PDF into MusicXML in the browser, then send it to 练习.
- **记录 History** — saved practice runs and training charts in this browser.
- **设置 Settings** — MIDI device, latency, and the computer-keyboard map.

The tab is the URL hash (`#practice`, `#train`, `#omr`, `#history`, `#settings`). `#library` opens the piece picker. `#sight` opens 训练.

Middle C is MIDI 60. Staff 1 is the right hand and staff 2 is the left. The on-screen keyboard, the computer keyboard, and a Web MIDI device all feed the same note stream.

## Run it

```bash
npm install
npm test
npm run fetch-models   # ONNX weights for 识谱, about 213 MB, not stored in git
npm run dev
```

The dev server is at [http://127.0.0.1:4317](http://127.0.0.1:4317). Use Chrome or Edge. Web MIDI only works in a secure context, and localhost counts.

```bash
npm run build
npm run preview
```

The production build uses a relative asset base, so the `dist` folder can be served from a subfolder. `npm run fetch-models` must run before `npm run build` if the 识谱 tab should work; the weights are copied from `public/models/homr/` into `dist`.

If a reverse proxy caches static files for a long time, send `Cache-Control: public, max-age=31536000, immutable` only on successful responses. In nginx that means the header must not use `always`, or a 404 for a missing model file stays cached after the file is added.

WebAssembly threads need a cross-origin isolated page. WebGPU does not. For the threaded fallback, serve with:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

The dev server and `vite preview` send those headers. Without them the recognizer still runs, on one WebAssembly thread.

## 识谱 / homr

The OMR tab lazy-loads [`homr-web`](https://github.com/jymen/homr-web) (AGPL-3.0-only), a browser port of [homr](https://github.com/liebharc/homr) by Christian Liebhardt, also AGPL-3.0. Serving this app conveys that library. The source of the unmodified library is that repository; this repository is the source of the integration. MusicXML a person produces with it is theirs.

OCR is disabled (`ocr: false`), so the ~32 MB RapidOCR models are not fetched and titles are left blank. The weights that are fetched, their hashes, and where they come from are listed in `public/models/homr/README.md`. The tab prefers WebGPU, falls back to WebAssembly, caches the files in Cache Storage, and shows download, init, and inference times plus whether the cache already held them.

## Pieces

练习 opens onto the graded library (L1–L5) in a side panel on a wide window and a top drawer on a narrow one. The last piece you opened is restored. With nothing to restore, the page asks you to pick a piece and offers three L1 scores. Light Steps and Sunday Chords are in that library as built-in L1 examples. You can still open a `.musicxml`, `.xml`, or `.mxl` file from the picker. A score sent over from 识谱 is saved in this browser under 我的曲谱.

## Layout

- `src/judge` — pure timing judge and its tests
- `src/score` — MusicXML parsing, kept apart from the OSMD drawing code
- `src/modes` — wait mode and rhythm mode
- `src/transport` — map event timestamps onto the Tone.js transport, plus the metronome
- `src/midi` — Web MIDI, computer-keyboard map, and the shared event bus
- `src/report` — hit rate, mean offset, timing spread, errors per measure
- `src/storage` — Dexie settings and the last run
- `src/ui` — score, keyboard, controls, feedback

Without hardware, click the on-screen keys or play the Q row from C4 and the Z row from C3.
