# Third-party notices

Note by Note is released under the GNU Affero General Public License v3.0 or later. See `LICENSE`.

## Code and algorithms

- [homr-web](https://github.com/jymen/homr-web) and [homr](https://github.com/liebharc/homr) by Christian Liebhardt. AGPL-3.0-only. The 识谱 tab loads homr-web. Serving this app conveys that library.
- [OpenSheetMusicDisplay](https://github.com/opensheetmusicdisplay/opensheetmusicdisplay). BSD-3-Clause. Draws the scores.
- [Tone.js](https://github.com/Tonejs/Tone.js). MIT. Metronome, demo playback, and the practice clock.
- Salamander Grand Piano, recorded by Alexander Holm. CC BY 3.0. A reduced set (every minor third, three velocity layers, Ogg Vorbis) is served from `public/samples/piano/` and loaded only after the first play or MIDI monitor gesture. The three layers are what let `pp` sound soft rather than merely quiet; rebuild them with `node scripts/build-piano-layers.mjs`. Original archive: https://archive.org/details/SalamanderGrandPianoV3 — license https://creativecommons.org/licenses/by/3.0/
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

Diabelli Op. 149 Nos. 11–28 are in `public/pieces/mutopia.json` where the conversion passed (No. 16 did not). Each kept file is the primo part, labeled 第一钢琴. Mikrokosmos, John Thompson (小汤/大汤; Thompson died 1963), Kodály's 333 exercises, and Pozzoli were not imported because they are still under copyright.

教材 added in `public/pieces/method.json`:

- Johann Friedrich Franz Burgmüller, 25 Études faciles, Op. 100, Nos. 2, 4, 5, 6, 8, 9, 10, 11, 15, 16 and 18. Public Domain. Typeset by Bas Wassink for the Mutopia Project (Mutopia-2013/01/12), from Collection Litolff, 19th century. Each LilyPond header says `copyright = "Public Domain"`. The MusicXML is converted from the Mutopia MIDI of that typesetting. Source directory: `https://www.mutopiaproject.org/ftp/BurgmullerJFF/O100/`.
- Nos. 1, 3, 7, 12, 13, 14 and 17 are on Mutopia under the same public-domain header, but the MIDI-to-MusicXML conversion did not keep every measure's duration equal to the time signature, so they were not imported.
- Nos. 19–25 are not in the Mutopia Op. 100 directory, so they were not imported.
- Ferdinand Beyer, Vorschule im Klavierspiel, Op. 101, was not imported. No MusicXML or LilyPond edition with an explicit public-domain or CC BY / CC BY-SA license was found (Mutopia has no Beyer). The public-domain scan used for checking is IMSLP file #12916, Edition Peters Nr. 2721, plate 8033, copyright tag V/V/V: `https://imslp.org/wiki/Special:ImagefromIndex/12916`. A note-accurate OMR of that scan was not reliable enough to mark any exercise `validated`.
- Carl Czerny, Practical Method for Beginners, Op. 599, was not imported. No public-domain or CC typeset MusicXML was found. A public-domain scan exists as IMSLP #105466 (copyright tag V/V/V, 56 pages) and was not transcribed because the same OMR check could not be validated.
- Cornelius Gurlitt, Op. 117 and Op. 140, were not imported. Mutopia has no Gurlitt directory, and no CC or public-domain typeset edition was found in this pass.

The approved Mutopia shortlist (waves 1 and 2) is in `public/pieces/mutopia/`. Each MusicXML file is converted from that piece's Mutopia MIDI, which Mutopia renders from the LilyPond source. The card shows the composer, typesetter, Mutopia id, license, and piece-info link. Method books sit on the 教材 shelf: 安娜·玛格达莱娜曲集, 巴赫小前奏曲, 车尔尼 Op.821, 哈农, 舒曼少年曲集, 布格缪勒 Op.100, 柴可夫斯基少年钢琴曲集, 迪亚贝利 Op.149, and 克莱门蒂 Op.42. Other shortlist pieces are graded L2–L5. Four-hand scores keep the primo part only. Hanon, Satie *Enfantillages*, and Clementi Op. 42 are split into separate items. Licenses are Public Domain or CC BY / CC BY-SA 2.5, 3.0, or 4.0, taken from each Mutopia page.

Not imported from that shortlist: duplicate editions Bach 983, 493, and 1015, and Chopin prelude 4 (921); the 57 Swedish dances; pieces already in the library (Czerny Op. 821 Nos. 1, 3, 11; Burgmüller Op. 100 Nos. 1, 3, 12; Schumann Op. 68 No. 1; Bach Musette Anh. 126). The MIDI conversion did not keep a usable time signature for Czerny Op. 821 Nos. 5, 9, 13, 17; Bach BWV 928, 936, 940, 943, and WTC I Prelude 1; Burgmüller Op. 100 Nos. 7, 13, 14; Schumann Op. 68 No. 16; Tchaikovsky Op. 39 No. 16; Diabelli Op. 149 No. 16; Diabelli Op. 163 sonatina 1 movement 4; Grieg Albumblatt; and some Clementi Op. 42 lessons. Those stay out. `public/pieces/mutopia-skipped.json` lists each one.

877 scores in `public/pieces/noctave.json` come from [Noctave](https://noctavepiano.com/en/free-library/), whose free library publishes each piece as PDF and MusicXML under a license stated in the page's JSON-LD. 742 of them are new to this library; 135 were already here. They were downloaded in November 2026 from `https://noctavepiano.com/bibliotheque-libre/<slug>/<slug>.mxl` and re-parsed here with the same parser the app uses; every one keeps its page URL in `source_url`. Each Noctave piece is itself an engraving of one of three upstream collections, and the card's `attribution` names it:

- 436 pieces based on the [Mutopia Project](https://www.mutopiaproject.org/). Public Domain, CC BY 2.5, or CC BY-SA 2.5/3.0/4.0, as the Noctave page states.
- 228 pieces based on [PDMX](https://github.com/pnlong/PDMX), the Paderborn/Münster MusicXML corpus ([dataset on Zenodo](https://zenodo.org/records/15571083), [paper](https://arxiv.org/abs/2409.10831)). Mostly public-domain marks (`PDM-1.0`) or `CC0-1.0`.
- 197 pieces based on [MuseScore](https://musescore.com/) uploads. Mostly `CC0-1.0` or `CC BY-SA`.

The 16 remaining pieces are Noctave's own engravings (15) plus one score a user supplied. Licenses are per piece: 730 are `CC0-1.0` or `PDM-1.0`, and 146 are `CC BY 2.5`, `CC BY 3.0`, `CC BY-SA 2.5`, `CC BY-SA 3.0`, or `CC BY-SA 4.0`. Those 146 need the composer, the upstream collection, and the license kept with any copy, and their cards say so. Share-alike applies to the derived MusicXML files.

Scores longer than 400 measures were left out (27 in all, mostly complete symphonies arranged for solo piano, up to 1558 measures), because a single practice session cannot hold them. Duplicate engravings of a piece already in the library were skipped too.

`public/pieces/pdmx.json` holds scores whose MusicXML comes from the [Vivace Music](https://vivace-music.org/) library. Vivace republishes public-domain MuseScore transcriptions taken from [PDMX](https://github.com/pnlong/PDMX) under the license each page states, and serves the MusicXML itself.

- George Frideric Handel, Passacaglia in G minor, HWV 432, piano arrangement by the MuseScore user pental (`https://musescore.com/user/4887176/scores/5912365`). CC0 1.0, via PDMX, typeset for Vivace Music. The composition is in the public domain. The file is used as Vivace ships it: `https://vivace-music.org/library/passacaglia-in-g-minor-hwv-432-handel-piano/musicxml/passacaglia-in-g-minor-hwv-432-handel.mxl`.
- 21 well-known pieces added in November 2026, among them Debussy's Clair de lune, Liszt's Liebestraum No. 3, and Tchaikovsky's Sugar Plum Fairy. 20 are MuseScore transcriptions via PDMX, either `CC0-1.0` or the Public Domain Mark 1.0. Each card names the MuseScore user and the original score URL. Chopin's Waltz Op. 64 No. 2 comes from the Humdrum encoding of the [Chopin First Editions](https://github.com/craigsapp/humdrum-chopin-first-editions) (NIFC). It is CC BY 4.0, so a copy must keep the composer, the source and the licence. The files come from `https://vivace-music.org/library/<slug>/musicxml/`. Three were edited so that every judged note is drawn. In Clair de lune, three hidden pitched notes became hidden rests of the same length; two of them doubled notes that are already printed. In Hungarian Dance No. 5 and the easy Skaters' Waltz, the chord symbols were removed.
- 24 popular modern pieces were added at the owner's request: Yiruma, Joe Hisaishi, Ryuichi Sakamoto, Hans Zimmer, Kenshi Yonezu, anime and game themes, and Korobeiniki. **Except for Korobeiniki, a traditional Russian song, these compositions are still under copyright and are not in the public domain.** The MuseScore arrangers tagged their arrangements CC0 1.0, but that tag covers only the arrangement, not the song. Each card's `license` reads `编配 CC0-1.0，作曲仍受版权保护`. Its attribution names the arranger and the original score URL. The chord symbols were removed from C418's Sweden so that every judged note is drawn.
- 207 more pieces were added from Vivace's catalogue (`https://vivace-music.org/library/data/songs.json`). They include Chopin's ballades, nocturnes, waltzes, polonaises and études, Nutcracker numbers, Debussy, ragtime, opera arias, Christmas carols, folk songs, and popular, anime and game music. 180 are MuseScore transcriptions via PDMX (`CC0-1.0` or the Public Domain Mark 1.0). The other 27, all Chopin, are Chopin First Editions encodings (CC BY 4.0). **52 of the 207 are compositions still under copyright** (popular songs and film, anime and game music), and their cards say so in the same way as above. In eight scores, hidden pitched notes became hidden rests of the same length so that every judged note is drawn: Handel's Water Music minuet, O mio babbino caro, Le Coucou, Songs My Mother Taught Me, and four Debussy pieces.
- Left out from that pass: KernScores pages (licence varies by collection), ASAP pages (non-commercial), scores over 400 measures (Rhapsody in Blue and Chopin's Scherzos Op. 31 and Op. 39), and scores whose middle staff of three is treble (Jeux d'eau, Tchaikovsky's Miniature Overture). Also left out are 17 Chopin First Editions scores that OSMD cannot draw or whose parts have different lengths: Ballade Op. 23, the Barcarolle, Fantaisie Op. 49, Impromptu Op. 29, Scherzos Op. 20 and Op. 54, Nocturnes Op. 9 No. 3, Op. 15 No. 1, Op. 27 No. 1, Op. 37 No. 2, Op. 62 No. 1 and Op. 72, Polonaises Op. 22 and Op. 44, Waltzes Op. 42 and Op. 64 No. 3, and Étude Op. 10 No. 4. National anthems, hymns, internet-meme songs and four-hand scores were not picked.
- Schubert's Ständchen (Liszt's transcription) and Mozart's Fantasia K. 397 were left out because their note lengths and voices do not match what OSMD draws in several bars.
- Three other Chopin First Editions scores were left out. OSMD cannot draw the 13:8 tuplets in the Nocturne Op. 9 No. 2 and the Waltz Op. 69 No. 1, and the right-hand part of the Étude Op. 10 No. 12 stops four bars before the left hand does.
- Not imported from Vivace: pages whose encoding comes from the ASAP dataset (CC BY-NC-SA 4.0, among them La Campanella, the "Tristesse" Étude, Schubert's Impromptu Op. 90 No. 4 and Moment musical No. 3, and Ravel's Pavane), pages from KernScores, which gives no single licence (the full Moonlight Sonata, The Entertainer, Maple Leaf Rag, Anitra's Dance, Schubert's Impromptu Op. 90 No. 3, The Happy Farmer), and Vivace's own easy arrangements, which state no licence. Rachmaninoff's Prelude Op. 3 No. 2 and Mozart's Lacrimosa were skipped because the scores spread one piano across four or three staves in a way the hand split cannot read.
- Later in November 2026, every easy version was removed at the owner's request: 77 from this shelf and 12 from the Noctave shelf. The counts above describe what was added before that. The shelf now holds 176 scores, 47 of them compositions still under copyright and 28 Chopin First Editions encodings. Mozart's "Sonata facile", K. 545, is the original piece, so it stays, and so do the one-hand theme melodies marked "(theme)".
