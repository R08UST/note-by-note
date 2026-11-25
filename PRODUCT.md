# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

One adult beginner pianist, the owner, practising alone at a MIDI keyboard. The deployed site is mainly for their own use. They sit at the instrument with the screen either on a laptop or desktop beside the keyboard (mouse and computer keyboard) or on a tablet on the music stand (touch). Both setups matter equally.

## Product Purpose

Note by Note is a practice stand in the browser. It shows a score, listens to what is played, and judges it note by note. Success means learning library pieces: first getting the notes right in Wait mode, then playing them in time in Rhythm mode. Drills, history, and OMR exist to serve that goal.

## Positioning

It judges real playing from a MIDI keyboard against real notation, entirely in the browser with no backend or account. Wait mode holds the cursor until the right keys are played. Rhythm mode scores timing per note with a beginner-sized window. A graded library of about 1000 scores and in-browser OMR (photo or PDF to MusicXML) mean any piece can be practised.

## Operating Context

- Hands are on the keys. Glances at the screen are brief, and the next attack has to be readable from a playing distance.
- A practice session is: pick a piece (L1–L5 library, 我的曲谱, or an imported file), choose hands, a span or loop, and the tempo, play in Wait mode, then in Rhythm mode, then read the summary (hit rate, timing offset and spread, errors per measure).
- 训练 adds sight-reading levels S1–S10 per hand, rhythm levels R1–R10, technique drills, and a daily warm-up.
- Input is Web MIDI, the computer keyboard (Q row from C4, Z row from C3), or the on-screen keyboard. Chrome or Edge is required for Web MIDI.

## Capabilities and Constraints

- Tabs: 练习, 训练, 识谱, 记录, 设置. The tab is in the URL hash.
- All data stays in the browser (Dexie / IndexedDB). There is no server-side state.
- Production assets use a relative base. COOP/COEP headers are needed for threaded WASM in OMR.
- The OMR models (~213 MB) and the OCR models (~32 MB) download lazily and are cached.
- UI copy is Chinese. Code, comments, and commits are English.
- Score drawing is OSMD. Judged notes are mapped onto its drawn noteheads, so visual changes to the score must keep that mapping working.

## Brand Commitments

- Name: Note by Note.
- Voice: plain, Chinese UI copy for a learner.
- License: AGPL-3.0-or-later. Third-party scores and libraries are credited in `THIRD_PARTY.md`.

## Evidence on Hand

- Library: `public/pieces/` (about 1000 scores) and `public/pieces/manifest.json`.
- Fixed question banks: `src/train/banks/*.json`.
- Sampled piano: `public/samples/`.
- There are no testimonials, users beyond the owner, or usage metrics. Don't invent any.

## Product Principles

1. The score and the next note come first. Nothing should compete with them while the player is playing.
2. Feedback is honest and specific: what was wrong, where, and by how much, without fake praise.
3. Every control must be reachable from the instrument, by mouse, keyboard, or touch.
4. It's local and private: no account, and the learner's data never leaves the browser.
5. Hold a beginner's tolerance, but never misreport what was played.
