# Third-party notices

Note by Note is released under the GNU Affero General Public License v3.0 or later. See `LICENSE`.

## Code and algorithms

- [homr-web](https://github.com/jymen/homr-web) and [homr](https://github.com/liebharc/homr) by Christian Liebhardt. AGPL-3.0-only. The 识谱 tab loads homr-web. Serving this app conveys that library.
- [OpenSheetMusicDisplay](https://github.com/opensheetmusicdisplay/opensheetmusicdisplay). BSD-3-Clause. Draws the scores.
- [Tone.js](https://github.com/Tonejs/Tone.js). MIT. Metronome and the practice clock.
- [WEBMIDI.js](https://github.com/djipco/webmidi). Apache-2.0.
- [pdf.js](https://github.com/mozilla/pdf.js). Apache-2.0.
- [Dexie](https://github.com/dexie/Dexie.js). Apache-2.0.
- RapidOCR models. Apache-2.0. See `public/models/homr/README.md`.

The training generators reimplement ideas from GPL-3.0 programs. They are not line-for-line copies. The research clones were not in this workspace, so the behavior follows the published structure of those programs:

- GNU Solfege (`solfege/const.py` rhythm cells and the ±10% inter-onset check). GPL-3.0.
- LenMus Phonascus (rhythm fragments, then a chord-per-bar pitch pass). GPL-3.0.
- MusicReader (`generator.py`: a progression that ends V–I, a step back after a leap, and about a 40% chance of repeating a bar's rhythm). GPL-3.0.
- ftrain/sightreading (pattern cells such as steps and triads, and drilling right hand, then left hand, then both). LGPL-3.0. The design is used; the code is not copied.
- philippotto/piano-trainer (hit window = half the shortest note, capped). MIT.
- Piano Marvel's strike rule (three scores under 80%) is a product behavior, not copied code.

## Scores

Graded pieces already in `public/pieces` keep the license written on each card (CC0, CC BY, or public domain).

练习曲 added from the Mutopia Project:

- Carl Czerny, 50 Melodische Übungsstücke, Op. 840, Nos. 1–10. Public Domain. Typeset by Manuela. Source: IMSLP, Mainz: Schott, n.d. [1855]. Each file's Mutopia RDF says `Public Domain`.
- Anton Diabelli, 28 melodische Übungsstücke, Op. 149, Nos. 1–10, primo part. CC BY-SA 3.0. Typeset by Alberto Simões for the Mutopia Project. Share-alike applies to these derived MusicXML files.
- Louis Streabbog (Gobbaerts), Les étoiles d'or, No. 1 Valse. CC BY-SA 4.0. Typeset by Masamichi Hosoda. Mutopia-2015/12/27-2092.

Nos. 11–28 of Diabelli were not imported. Mikrokosmos, John Thompson (小汤/大汤; Thompson died 1963), Kodály's 333 exercises, and Pozzoli were not imported because they are still under copyright.

教材 added in `public/pieces/method.json`:

- Johann Friedrich Franz Burgmüller, 25 Études faciles, Op. 100, Nos. 2, 4, 5, 6, 8, 9, 10, 11, 15, 16 and 18. Public Domain. Typeset by Bas Wassink for the Mutopia Project (Mutopia-2013/01/12), from Collection Litolff, 19th century. Each LilyPond header says `copyright = "Public Domain"`. The MusicXML is converted from the Mutopia MIDI of that typesetting. Source directory: `https://www.mutopiaproject.org/ftp/BurgmullerJFF/O100/`.
- Nos. 1, 3, 7, 12, 13, 14 and 17 are on Mutopia under the same public-domain header, but the MIDI-to-MusicXML conversion did not keep every measure's duration equal to the time signature, so they were not imported.
- Nos. 19–25 are not in the Mutopia Op. 100 directory, so they were not imported.
- Ferdinand Beyer, Vorschule im Klavierspiel, Op. 101, was not imported. No MusicXML or LilyPond edition with an explicit public-domain or CC BY / CC BY-SA license was found (Mutopia has no Beyer). The public-domain scan used for checking is IMSLP file #12916, Edition Peters Nr. 2721, plate 8033, copyright tag V/V/V: `https://imslp.org/wiki/Special:ImagefromIndex/12916`. A note-accurate OMR of that scan was not reliable enough to mark any exercise `validated`.
- Carl Czerny, Practical Method for Beginners, Op. 599, was not imported. No public-domain or CC typeset MusicXML was found. A public-domain scan exists as IMSLP #105466 (copyright tag V/V/V, 56 pages) and was not transcribed because the same OMR check could not be validated.
- Cornelius Gurlitt, Op. 117 and Op. 140, were not imported. Mutopia has no Gurlitt directory, and no CC or public-domain typeset edition was found in this pass.
