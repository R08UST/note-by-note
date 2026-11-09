# Note by Note

A browser practice stand for a beginner with a MIDI keyboard. The window is a tab bar:

- **练习 Practice** — load a MusicXML score, play in Wait or Rhythm mode, and loop the piece when it ends.
- **视奏 Sight-reading** — a placeholder for drills that are not built yet.
- **识谱 OMR** — turn a photo of a page into MusicXML in the browser.
- **记录 History** — saved runs in this browser.
- **设置 Settings** — MIDI device, latency, and the computer-keyboard map.

The tab is the URL hash (`#practice`, `#sight`, `#omr`, `#history`, `#settings`).

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

Three scores are bundled: Twinkle, Twinkle (right hand), Light Steps (both hands), and Sunday Chords. You can also open a `.musicxml`, `.xml`, or `.mxl` file.

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
