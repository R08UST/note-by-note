# Note by Note

A browser practice stand for a beginner with a MIDI keyboard. Load a MusicXML score, play in **Wait** mode (the cursor holds until the written notes are down) or **Rhythm** mode (count-in, metronome, early/late timing), and read a short summary at the end.

Middle C is MIDI 60. Staff 1 is the right hand and staff 2 is the left. The on-screen keyboard, the computer keyboard, and a Web MIDI device all feed the same note stream.

## Run it

```bash
npm install
npm test
npm run dev
```

The dev server is at [http://127.0.0.1:4317](http://127.0.0.1:4317). Use Chrome or Edge. Web MIDI only works in a secure context, and localhost counts.

```bash
npm run build
npm run preview
```

The production build uses a relative asset base, so the `dist` folder can be served from a subfolder.

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
