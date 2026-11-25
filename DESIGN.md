---
name: Note by Note
description: A piano practice stand in the browser. Cream score paper in a warm, dark evening room.
colors:
  walnut-night: "#1b1612"
  walnut-raised: "#2a231c"
  walnut-sunken: "#14110e"
  seam: "#3d342b"
  seam-hover: "#5a4c3f"
  raised-hover: "#342b23"
  ivory-ink: "#f6efe4"
  dusty-linen: "#b5a694"
  score-paper: "#f4efe4"
  paper-shade: "#efe6d6"
  sepia-ink: "#241c16"
  paper-muted: "#7b6b5b"
  lamp-amber: "#e39b3b"
  lamp-amber-bright: "#eeab52"
  amber-ink: "#2b1c08"
  moss: "#1f8a5b"
  coral: "#d4533a"
  tone-good: "#8ddebe"
  tone-warn: "#f0c27a"
  tone-bad: "#ffb1a3"
  hand-right: "#f3d7a4"
  hand-right-deep: "#c47a2a"
  hand-left: "#b7ddd4"
  hand-left-deep: "#2f6f62"
typography:
  display:
    fontFamily: "Iowan Old Style, Palatino, Palatino Linotype, Georgia, serif"
    fontSize: "3rem"
    fontWeight: 400
    lineHeight: 0.9
  headline:
    fontFamily: "Iowan Old Style, Palatino, Palatino Linotype, Georgia, serif"
    fontSize: "1.5rem"
    fontWeight: 400
    lineHeight: 1.2
  title:
    fontFamily: "Iowan Old Style, Palatino, Palatino Linotype, Georgia, serif"
    fontSize: "1.15rem"
    fontWeight: 560
    letterSpacing: "-0.03em"
  numeral:
    fontFamily: "Iowan Old Style, Palatino, Palatino Linotype, Georgia, serif"
    fontSize: "1.25rem"
    fontWeight: 400
    lineHeight: 1.15
  body:
    fontFamily: "Avenir Next, Segoe UI, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
  label:
    fontFamily: "Avenir Next, Segoe UI, sans-serif"
    fontSize: "0.8rem"
    fontWeight: 400
    letterSpacing: "0.04em"
rounded:
  sm: "8px"
  md: "10px"
  lg: "14px"
  pill: "999px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "24px"
  control: "32px"
components:
  button:
    backgroundColor: "{colors.walnut-raised}"
    textColor: "{colors.ivory-ink}"
    rounded: "{rounded.pill}"
    padding: "0 12px"
    height: "32px"
  button-hover:
    backgroundColor: "{colors.raised-hover}"
  button-primary:
    backgroundColor: "{colors.lamp-amber}"
    textColor: "{colors.amber-ink}"
    rounded: "{rounded.pill}"
    padding: "0 12px"
    height: "32px"
  button-primary-hover:
    backgroundColor: "{colors.lamp-amber-bright}"
  button-secondary:
    backgroundColor: "{colors.walnut-sunken}"
    textColor: "{colors.ivory-ink}"
    rounded: "{rounded.pill}"
    height: "32px"
  button-stop:
    textColor: "{colors.tone-bad}"
    rounded: "{rounded.pill}"
    height: "32px"
  segmented:
    backgroundColor: "{colors.walnut-sunken}"
    textColor: "{colors.dusty-linen}"
    rounded: "{rounded.pill}"
    padding: "2px"
    height: "32px"
  segmented-selected:
    backgroundColor: "{colors.lamp-amber}"
    textColor: "{colors.amber-ink}"
    rounded: "{rounded.pill}"
  tab:
    textColor: "{colors.dusty-linen}"
    rounded: "{rounded.pill}"
    padding: "0 16px"
    height: "28px"
  tab-selected:
    backgroundColor: "{colors.lamp-amber}"
    textColor: "{colors.amber-ink}"
  input:
    backgroundColor: "{colors.walnut-sunken}"
    textColor: "{colors.ivory-ink}"
    rounded: "{rounded.sm}"
    padding: "0 10px"
    height: "32px"
  panel:
    backgroundColor: "{colors.walnut-raised}"
    rounded: "{rounded.lg}"
    padding: "16px"
  library-card:
    backgroundColor: "{colors.walnut-sunken}"
    textColor: "{colors.ivory-ink}"
    rounded: "12px"
    padding: "10px 12px"
  level-chip:
    backgroundColor: "{colors.walnut-sunken}"
    rounded: "{rounded.md}"
    padding: "4px 8px"
    height: "32px"
  level-chip-selected:
    backgroundColor: "{colors.lamp-amber}"
    textColor: "{colors.amber-ink}"
  score-frame:
    backgroundColor: "{colors.score-paper}"
    textColor: "{colors.sepia-ink}"
    rounded: "18px"
  summary:
    backgroundColor: "{colors.score-paper}"
    textColor: "{colors.sepia-ink}"
    rounded: "{rounded.md}"
    padding: "8px 10px"
---

# Design System: Note by Note

## Overview

**Creative North Star: "The Evening Practice Room"**

A calm room after dark, warm and private, where someone practises steadily without hurry. The room is Walnut Night: dark, warm brown, and quiet. The score sits in it as cream paper, the brightest thing on screen, because the next note is the only thing that matters while the hands are on the keys. One lamp colour, Lamp Amber, falls on whatever is active right now: the selected tab, the primary action, the key to play, the count-in.

It is an Operate surface. Ambition shows as restraint. Controls are compact pills that answer a touch and then step out of the score's way. Numbers that matter (hit rate, timing, counts) are set in an old-style serif, so a result reads like a handwritten note in the margin rather than a dashboard metric. Feedback uses three soft tones (good, warn, bad) that are pale enough to sit in a dim room without glaring.

The look avoids the cold DAW or studio: no clinical grey-on-black, no neon meters, no dense pro-audio panel walls.

**Key Characteristics:**
- Warm dark room, cream paper for the score and the results, one amber accent.
- Fully flat. Depth comes from tone and thin seams, never from shadows.
- Pills that are quiet and tactile, at a 32 px control height.
- Serif for titles and numerals, a humanist sans for everything you operate.
- Chinese UI copy set in the sans stack. The system CJK fallback carries it.

## Colors

A warm, low-light palette: walnut browns, ivory ink, cream paper, and one amber lamp, plus soft feedback tones.

### Primary
- **Lamp Amber**: the single accent. Use it for the current selection (tab, segmented option, level chip, library card border), the primary button, the target key, the count-in, the focus ring (2 px outline, 2 px offset), and links. Text on it is always **Amber Ink**. On hover it brightens to **Lamp Amber Bright**.

### Secondary
- **Moss**: the "connected" dot on the MIDI chip and the perfect zone inside the timing meter (at 55% opacity). It is not a second accent, so don't put it on buttons.
- **Coral**: error text on the dark ground, such as MIDI failures.

### Feedback tones
- **Tone Good** (`tone-good`): a correct hit. Used for text in the feedback strip and for flashing the key.
- **Tone Warn** (`tone-warn`): early, late, or an extra note.
- **Tone Bad** (`tone-bad`): a wrong or missed note, and the stop button.

### Hands
- **Right Hand** (light / deep): the pale apricot and burnt-orange fills for right-hand keys on the keybed.
- **Left Hand** (light / deep): the pale sea-glass and deep teal fills for left-hand keys.

### Neutral
- **Walnut Night**: the page ground. Two faint radial glows sit on it, amber at the top left and moss at the top right, at 16% and 10% opacity. They are the room's lamp light, not decoration to copy elsewhere.
- **Walnut Raised**: panels, the toolbar, the controls bar, the library slot, and the default button.
- **Walnut Sunken**: inputs, segmented tracks, library cards, chips, the keyboard panel, and meter troughs.
- **Seam**: every 1 px border and divider. On hover it becomes **Seam Hover**.
- **Ivory Ink**: primary text on the dark ground.
- **Dusty Linen**: secondary text, labels, unselected tabs, hints.
- **Score Paper** / **Paper Shade**: the score frame and the run summary, and the tiles inside the summary.
- **Sepia Ink** / **Paper Muted**: text on paper and its labels.

### Named Rules
**The One Lamp Rule.** Lamp Amber marks only what is active or what to do next. If two amber things on screen compete for "now", one of them is wrong.

**The Paper Is the Score Rule.** Score Paper is reserved for notation and the result of playing it (the score frame, the summary, OMR previews). Never use it for chrome, cards, or dialogs.

**The Tokens Not Hex Rule.** Use the CSS custom properties in `src/index.css` (`--bg-sunken`, `--line`, `--tone-good`, `--amber-bright`, and so on). Never write a token's hex value again in a component rule.

## Typography

**Display / Title Font:** Iowan Old Style (with Palatino, Palatino Linotype, Georgia, serif)
**Body / Label Font:** Avenir Next (with Segoe UI, sans-serif)

**Character:** A bookish old-style serif for names and numbers next to a clear humanist sans for operating. It reads like an engraved score title beside a practice log.

### Hierarchy
- **Display** (400, 3rem, line height 0.9): the summary hit-rate percentage only. It drops to 2.4rem below 860 px. The count-in uses the same face at 2.4rem.
- **Headline** (400, 1.35–1.5rem): the empty-state prompt and the feedback headline.
- **Title** (560, 1.15rem, -0.03em): the app title, panel `h2`, the now-playing piece name (1rem), and settings `h3`.
- **Numeral** (400, 1.2–1.4rem, serif): tallies, summary stats, OMR timings, the note hint.
- **Body** (400, 0.875rem): all controls and running text. Help text is capped at 72ch.
- **Label** (0.72–0.75rem, 0.04em tracking, uppercase for Latin): kickers, table headers, stat labels.
- **No eyebrows.** A heading carries its own weight. Don't put a small kicker above it.
- **Floor:** no text smaller than 0.8rem (11.2 px at the 14 px root). The `--font-xs` token is that floor.

### Named Rules
**The Serif Counts Rule.** A number that reports how the playing went is set in the serif. A number you type or adjust (BPM, latency, start measure) stays in the sans.

## Layout

The app is a full-height single screen (`100dvh`, no page scroll) with an 8 px gutter. The header row holds the title on the left and a pill tab bar on the right. Below it, the tab panel fills the rest of the screen and scrolls internally.

- **Spacing rhythm:** 4 / 8 / 12 / 16 / 24 px. Most gaps are 8 px, and dense rows use 4 px.
- **Control height:** 32 px for buttons, inputs, segmented controls, and chips. Tabs are 28 px inside a 3 px track.
- **Practice:** with the picker open, a two-column grid: a 300 px library slot (260–320 px while practising) next to the main column. The main column runs now-playing, toolbar, score frame (flexes to fill), keyboard panel.
- **Focus mode is the play view:** a loaded piece opens in focus by default (saved as `focusMode`). The chrome is hidden. The next-note readout and the run summary stay above the score, which takes the rest of the window. The listen bar and the focus dock (开始/停止, 键盘, 显示工具) float as pills in the bottom corners. Esc or 显示工具 brings the toolbar back as a set-up layer.
- **Zoom** lives in the score's own sticky header row, styled for paper, in both views.
- **Touch:** under `(pointer: coarse)` the control height grows to 44 px, and icon buttons show their label.
- **Library:** cards in `auto-fill, minmax(200px, 1fr)` grids, grouped into collapsible composer shelves.
- **Breakpoints:** at 860 px the tabs drop to their own full-width row and the practice grid stacks (library 42% / score). At 560 px the gutter tightens and the metric grids go to one column.

## Elevation & Depth

**Fully flat.** No surface casts a shadow. Depth is tonal: Walnut Sunken sits below Walnut Night, which sits below Walnut Raised, and Score Paper is the lightest plane. Everything is separated by 1 px Seam borders. Floating things (the more-menu panel, the focus dock, the count-in) separate by a Seam border and a raised or near-opaque tone, never a drop shadow.

Inset rings on keys (`inset 0 0 0 3px` amber for the target, 2 px at 70% for a hint) are state marks, not depth, and stay. The 8 px lower lip on white keys is the drawing of a piano key and also stays.


### Named Rules
**The Flat Room Rule.** No `box-shadow` for elevation, anywhere. If something needs to stand out, change its tone or give it a Seam border.

## Shapes

Soft, rounded, never sharp. Interactive controls are full pills (999px): buttons, segmented tracks and options, tabs, history chips, the focus dock. Containers use gentle corners: 8 px for inputs and small strips, 10 px for chips, toolbars, and the summary, 14 px for panels. The score frame is the softest at 18 px. The incumbent also uses 12 px (library cards, drop zone) and 16 px (feedback, keyboard panel) ad hoc. New work should pick from the scale. Borders are always 1 px Seam. The drop zone alone uses a dashed Seam border.

## Components

Quiet and tactile. They answer a touch, then get out of the score's way.

### Buttons
- **Shape:** full pill (999px), 32 px high, 12 px side padding, 6 px gap for an icon.
- **Default:** Walnut Raised fill, Seam border, Ivory Ink text.
- **Primary:** Lamp Amber fill and border, Amber Ink text, weight 650. On hover it becomes Lamp Amber Bright.
- **Secondary:** Walnut Sunken fill. **Ghost:** transparent, with a 4% white wash on hover. **Icon:** square, 32 × 32. **Stop:** transparent, Tone Bad text, a dark coral border.
- **Hover / Focus:** 120 ms ease on background, border, and colour. The default button gets Seam Hover and Raised Hover. Focus is a 2 px Lamp Amber outline with a 2 px offset. Disabled is 45% opacity with a not-allowed cursor.

### Segmented controls and tabs
- **Style:** a Walnut Sunken pill track with 2–3 px padding, holding transparent pill options in Dusty Linen.
- **Selected:** a Lamp Amber fill with Amber Ink text, driven by `aria-pressed` or `aria-selected`. On hover an unselected option brightens to Ivory Ink over a 5% white wash.
- **Library filters:** they drop the track and lay out each option as its own bordered pill, with the group's `aria-label` printed as a small leading label.

### Chips
- **Level chip:** Walnut Sunken, a 10 px corner, a bold level name over a small amber tag. Selected, it fills with Lamp Amber.
- **Bank chip:** Walnut Sunken, a 10 px corner. The current item has an amber border, and a clean item has amber text.

### Cards / Containers
- **Panel:** Walnut Raised, a Seam border, a 14 px corner, 16 px padding. A serif `h2` title, Dusty Linen paragraphs.
- **Library card:** Walnut Sunken, a Seam border, a 12 px corner. A two-line clamped title, a muted meta line, and a folding details row. Selected: an amber border and an 8% amber wash.
- **Summary:** Score Paper with Sepia Ink, a 10 px corner. A serif display percentage, Paper Shade tiles for stats and measures, and measures with errors tinted pale coral.

### Inputs / Fields
- **Style:** 32 px high, an 8 px corner, a Seam border, Walnut Sunken fill, 10 px side padding. Range sliders and checkboxes use `accent-color` Lamp Amber.
- **Focus:** the shared 2 px Lamp Amber outline.
- **Labels:** inline, Dusty Linen, 0.8125rem.

### Navigation
- **Tabs:** pills in a Walnut Sunken track, top right in the header. Labels are Dusty Linen at weight 600, Ivory Ink on hover, and an Amber fill with Amber Ink when selected. Below 860 px the track stretches full width on its own row.

### Score Frame (signature)
Cream paper with Sepia Ink notation from OSMD, an 18 px corner, scrolling internally, with a sticky meta row whose background fades out of the paper. The practice span is a 1.5 px amber outline at 45% opacity around each note, a light frame rather than a heavy box. The count-in is a 72 px Lamp Amber square with an 18 px corner and a serif numeral, pinned to the bottom right.

### Keybed (signature)
White keys are an ivory gradient with an 8 px bottom corner. Black keys are a dark walnut gradient with a 6 px corner. Hand colours fill the keys of the active hand. The target key gets a 3 px amber inset ring. A struck key flashes Tone Good, Tone Bad, or Tone Warn. Key names and computer-keyboard `kbd` hints sit at the bottom of each key in 0.68rem.

## Do's and Don'ts

### Do:
- **Do** keep Lamp Amber to what is active or next. Its rarity is what makes it readable at a glance from the keys.
- **Do** keep the score on Score Paper and let it take every pixel the layout can give it.
- **Do** set reported numbers in the serif and controls in the sans.
- **Do** build controls at 32 px with pill corners and 1 px Seam borders, using 120 ms ease hovers.
- **Do** use the `:root` custom properties from `src/index.css`, not literal hex.
- **Do** separate surfaces by tone and Seam borders only.

### Don't:
- **Don't** add `box-shadow` for elevation (see the Flat Room Rule).
- **Don't** fill a switched-on toggle (such as 循环) with amber. An on state is an amber ring and amber text. Amber fill is reserved for the selection and the next action.
- **Don't** drift toward a cold DAW or studio look: no neutral grey-on-black panels, no neon or saturated meters, no dense walls of knobs and readouts.
- **Don't** introduce a second accent colour. Moss and Coral are status, not brand.
- **Don't** put Score Paper behind chrome, menus, or settings.
- **Don't** use full-strength Moss or Coral for feedback text on the dark ground. Use the pale feedback tones.
