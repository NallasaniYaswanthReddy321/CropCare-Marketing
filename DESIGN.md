# CropCare — farmer-first design system

## The rule
> A farmer who cannot read English, has never used an app, and is standing in bright
> sunlight must be able to get today's answer in **one tap and one sentence**.

Everything below exists to satisfy that rule without hiding the science underneath.

## 1. Two modes, one codebase

| | Simple mode (default) | Expert mode |
|---|---|---|
| Words | "Water today?" | "FAO-56 irrigation" |
| Home | 4 giant buttons + one plain answer | Full dashboard with ET₀, Kc, TAW/RAW |
| Numbers | Only the number you act on | Every intermediate figure |
| Switch | Settings → *Simple words*, or the toggle in All tools |

Both modes read from **one menu definition** (`lib/menu.ts`), so a tool can never
exist in one mode and be missing in the other. Every entry carries a `simple`
label, an `expert` label and a one-sentence `hint`.

## 2. The answer-first layout

Each screen opens with an `AnswerCard`: a coloured strip with **one headline**,
**one explanation in everyday words**, a picture, and a speaker button that reads
it aloud in the farmer's language.

```
🟠  Give water today — 22 mm
    That is about 264 thousand litres for 1.2 ha, roughly 2.1 hours on your drip.
    [ Open water plan ]                                          🔊
```

The charts, coefficients and model cards stay on the same screen — below the fold —
so an agronomist or a lender can audit exactly how the sentence was produced.

## 3. Pastel palette — "Sunrise Field"

| Token | Value | Used for |
|---|---|---|
| `bg` | `#FFFBF4` cream | page ground, readable in sun |
| `card` | `#FFFFFF` | raised surfaces |
| `text` | `#22372B` deep green-ink | body copy — 12.6:1 on cream (AAA) |
| `primary` | `#2E8B57` sea green | actions, "good" state — 4.6:1 (AA) |
| `accent` | `#E58F65` clay | secondary highlights |
| `warn` / `danger` | `#D69028` / `#D25B52` | act-today, act-now |
| tints | mint `#CDEFD8`, sky `#CDE7F5`, blush `#F8D6D0`, butter `#FBEFC0`, lilac `#DED3F0`, peach `#FBD9B7` | tiles, chips, section washes |

Night Farm (dark) keeps the same semantics with lifted luminance for pre-dawn use.
Colour is never the only signal — every state also carries an icon and a word.

## 4. Pictures, not jargon

All artwork is generated offline by `scripts/make_assets.py` (Pillow) and bundled
with the app, so it works in airplane mode and adds no network dependency:

* 4 scene illustrations (farm, market, help, splash)
* 10 crop cards — the crop picker is **pictures**, not a dropdown
* 12 feature tiles, 4 weather icons, 4 avatars, 3 empty states, 1 badge

Regenerate at any time with `python scripts/make_assets.py`.

## 5. Touch, type and voice

* Minimum target 48 dp, 60 dp in elder mode (`touch()` in `lib/theme.ts`).
* Body type 15 pt minimum, +3 pt in elder mode (`scaleFont`).
* `Stepper` replaces keyboards for numbers; `PicturePicker` replaces dropdowns.
* Every answer card and lesson has a 🔊 button (Piper / system TTS, 9 languages).
* Nine-language UI with English fallback so a missing string never renders blank.

## 6. Farmers extend the app themselves

* **Add a field** — a four-step picture wizard (crop → size & soil → water → check)
  with soil described by feel ("sticky when wet, cracks when dry"), not by texture class.
* **Add a tool** — any of the 28 modules can be pinned to the home screen from
  *My tools → Add tool*, or with the ⭐ in All tools. The choice is stored on device.
* **Add a listing, animal, machine or seed** — each marketplace screen has its own
  add flow that writes to the same offline store and outbox.

## 7. Accessibility checklist

- [x] WCAG AA contrast for all text and UI states, both themes
- [x] `accessibilityRole` / `accessibilityLabel` on every control
- [x] 48 dp targets, 60 dp elder mode (WCAG 2.5.5)
- [x] Text resizes without clipping; no fixed-height text boxes
- [x] Never colour-only: icon + word accompany every state
- [x] Voice output for every primary answer; voice input where the engine exists
- [x] Reduced-motion respected in the web build
