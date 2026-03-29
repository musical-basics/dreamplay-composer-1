# Note Reveal Fix — VexFlow Element Lookup Bug

## Bug
NOTE reveal mode did nothing — all notes remained visible regardless of cursor position.

## Root Cause Chain (4 cascading issues)

### 1. `setAttribute('id')` Corrupted VexFlow's Internal ID
**File:** `VexFlowRenderer.tsx` line 254  
**Symptom:** `querySelector('[id="vf-M1-S0-V0-B1"]')` found nothing  
**Cause:** VexFlow v5's `Element.newID()` generates IDs like `auto1623`. The SVG renderer creates DOM elements with `prefix(attrs.id)` → `vf-auto1623`. Our `staveNote.setAttribute('id', 'vf-M1-...')` overwrote `attrs.id`, so `getSVGElement()` looked for `prefix('vf-M1-...')` → `vf-vf-M1-...` (double-prefixed — doesn't exist).  
**Fix:** Removed `setAttribute('id')` call entirely. Use VexFlow's native `getSVGElement()` method which correctly resolves `prefix('auto1623')` → finds `vf-auto1623` in the DOM.

### 2. `handleRenderComplete` Had Duplicate DOM Setup
**File:** `ScrollView.tsx` lines 162-179  
**Symptom:** CSS transforms applied to individual `<path>` children instead of `<g>` group  
**Cause:** `handleRenderComplete` re-queried all paths/rects and set `transformOrigin: 'center'` on each path, conflicting with VexFlowRenderer's group-level `transformOrigin: 'center bottom'`.  
**Fix:** Removed duplicate DOM setup entirely — VexFlowRenderer's coordinate extractor now populates `element` and `pathsAndRects` directly. ScrollView's `handleRenderComplete` only caches `absoluteX`.

### 3. Reveal Mode `useEffect` Fired Before Elements Existed
**File:** `ScrollView.tsx` lines 257-285  
**Symptom:** Entering NOTE mode didn't hide notes on page load  
**Cause:** React's `useEffect([revealMode])` fires synchronously during mount, before VexFlowRenderer's `requestAnimationFrame` populates `note.element`. Setting `opacity='0'` on `null` elements was a no-op.  
**Fix:** Added `revealModeRef` to track current value. After `handleRenderComplete` runs (when elements exist), re-hide all notes if `revealModeRef.current === 'NOTE'`.

### 4. `isRevealed` State Not Reset on Mode Toggle
**File:** `ScrollView.tsx`  
**Symptom:** Toggling NOTE mode off and back on didn't re-hide notes  
**Cause:** `isRevealed` remained `true` from previous reveal pass  
**Fix:** Set `isRevealed = undefined` when leaving NOTE mode (forces re-eval), `isRevealed = false` when entering.

## Failed Fixes (tried before finding root cause)

1. **`staveNote.el` property** — doesn't exist in VexFlow v5
2. **`attrs.id` fallback** — contained our corrupted custom ID, not the auto-generated one
3. **`staveNote.attrs.el`** — doesn't exist either
4. **Removing `scrollLeft` inflation** — was a real math bug but unrelated to the element lookup failure

## What Worked
Reading VexFlow v5's `element.js` source directly to understand the `getSVGElement()` → `prefix(attrs.id)` → `document.getElementById()` chain. This revealed the double-prefix corruption.

## Remaining Issue: Orphaned Stems (FIXED)
Stems/beams show ahead of the cursor even though noteheads are hidden. VexFlow renders beams as separate `<g class="vf-beam">` groups outside the `.vf-stavenote` `<g>` element we're hiding.

**Fix:** Collect ALL `g[class*="vf-"]` groups (excluding staves, clefs, key/time signatures). Hide them on NOTE mode entry and reveal by X position in the animation loop.

### Ties/Slurs Appearing Early (Sub-Fix)
Ties and slurs span from a past note to a future note. Using their LEFT bounding rect edge caused them to be revealed prematurely.

**Fix:** Use the RIGHT edge of the bounding rect so ties are only revealed when the cursor passes their end point.

## Font Timing Issue
Switching tabs or reveal modes could cause VexFlow fonts to not render correctly.

**Fix:** Added `visibilitychange` listener on both admin and learn pages to reset and re-apply `musicFont` after a 1-second delay when the user switches back to the tab. Uses `savedFontRef` to track the current font across tab switches.

### Preview / RevealMode / DarkMode Toggle Font Revert
Toggling any of these settings triggers React re-renders that cause VexFlow to briefly display the default font instead of the selected one.

**Fix:** Added a `useEffect` on the admin page that watches `previewEffects`, `revealMode`, and `darkMode`. When any changes, it resets `musicFont` to blank and re-applies after 1s delay.

## State Persistence
Settings were lost on page refresh — `previewEffects`, `revealMode`, `darkMode`, etc. reset to defaults.

**Fix:** Added Zustand `persist` middleware to `lib/store.ts`. UI preferences (14 settings) are saved to localStorage under `ultimate-pianist-settings`. Transient state (playback, MIDI data, anchors) is excluded via `partialize`.

### Persisted Settings
`revealMode`, `darkMode`, `highlightNote`, `glowEffect`, `popEffect`, `jumpEffect`, `previewEffects`, `showCursor`, `showScore`, `showWaterfall`, `velocityKeyColor`, `noteGlow`, `cursorPosition`, `curtainLookahead`, `dynamicColor`

## MIDI Velocity Baking Timing Issue

### Bug
After implementing MIDI velocity → score highlight coloring, the `[MidiMatcher] Baked: 414 matched` log showed matching succeeded, but notes still used the fallback green (`#10B981`). Debug logging revealed `vel=undefined` on the NoteData at highlight time.

### Root Cause
The `bakeMidiOntoNotes()` function was called in a `useEffect` with `[isLoaded, parsedMidi, anchors, beatAnchors]` dependencies. It ran successfully on the first render. However, VexFlow's font delay mechanism triggers a **second render** ~1 second later (to apply the correct music font). This second render creates entirely **new** `NoteData` objects in `noteMap.current`, but the baking useEffect does NOT re-fire because none of its dependencies changed (`isLoaded` was already `true`, and `parsedMidi`/`anchors` didn't change).

### Failed Fixes
1. **useEffect-only baking** — only fires on dependency changes, not on re-renders that replace the ref's contents

### Solution
Call `bakeMidiOntoNotes()` directly inside `handleRenderComplete` (after noteMap is populated) using refs for `parsedMidi`/`anchors`/`beatAnchors` so the callback always has latest values. The useEffect is retained to handle re-baking when anchors or MIDI data changes.

**Key pattern:** When data is stored in a `useRef` (like `noteMap`), React effects won't detect when the ref's contents are replaced. Direct calls in the completion callback are needed.

## Grace Note Fly-In (Multiple Root Causes)

### Bug
Grace notes animated ("flew in") from the right side of the screen when revealed in NOTE mode. Each fix reduced the distance but didn't eliminate it until the full chain of causes was understood.

### Root Cause Chain (3 cascading issues)

#### 1. CSS `transform` transition on ALL elements
**File:** `VexFlowRenderer.tsx` line 664
**Symptom:** Grace notes animated smoothly from far right when revealed
**Cause:** `transition: 'transform 0.1s ease-out, filter 0.1s'` applied to ALL note `<g>` elements indiscriminately.

#### 2. VexFlow v5 doesn't create CSS classes for GraceNoteGroup
**Symptom:** `.vf-gracenotegroup` class detection (both `.closest()` and `.querySelector()`) returned null for ALL notes — no `[GRACE DEBUG]` logs appeared
**Cause:** VexFlow v5's `GraceNoteGroup` is a `Modifier` that draws grace notes via `graceNote.drawWithStyle()` directly. It never creates a wrapping `<g class="vf-gracenotegroup">` element in the SVG DOM.

#### 3. `transformBox: fill-box` + `scale(1.4)` on wide bounding box
**Symptom:** Grace notes still appeared to move even after removing CSS transition (just without animation)
**Cause:** `transformBox: fill-box` creates a bounding box spanning BOTH the main note AND all attached grace notes. `scale(1.4)` from `transformOrigin: center center` of this wide box shifts grace notes visually because the scale origin is far from their individual centers.

### Failed Fixes (tried in order)
1. **Removing opacity from CSS transition** — reduced fly-in distance but `transform` transition still animated
2. **`.closest('.vf-gracenotegroup')` (checking UP DOM tree)** — class doesn't exist; returned null
3. **`.querySelector('.vf-gracenotegroup')` (checking DOWN DOM tree)** — class doesn't exist either
4. **Removing only `transform` CSS transition for grace notes** — scale still caused instant position shift

### Solution
Added `hasGrace` boolean flag to `NoteData` (set from `IntermediateNote.graceNotes` during rendering). For notes with `hasGrace=true`:
- ❌ Skip `transformBox: fill-box` (prevents wide bounding box)
- ❌ Skip `transformOrigin: center center`
- ❌ Skip CSS `transition: transform`
- ❌ Skip `scale()` pop effect in animation loop
- ❌ Skip `translateY()` jump effect in animation loop
- ✅ Still gets highlight color + glow effect (no spatial transforms)

**Key learning:** VexFlow v5 modifiers (grace notes, articulations, etc.) don't create identifiable CSS classes in the SVG DOM. Use data-level flags from the IntermediateScore instead of DOM queries.

**Future fix:** If VexFlow source is edited, the `GraceNoteGroup.draw()` method could render grace notes into their own nested `<g>` with a proper `transform` attribute isolated from the parent note. This would allow `transformBox: fill-box` on the main note without affecting grace note positioning, re-enabling pop/jump effects for those notes.
