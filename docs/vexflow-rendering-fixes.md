# VexFlow Rendering Fixes — Session Notes

> Documenting the challenges, failed approaches, and final solutions for VexFlow music notation rendering.

---

## 1. Tuplet Heuristic — False Positive Detection

**Problem**: The heuristic for detecting triplets was triggering on standard eighth-note passages, creating false tuplet brackets.

**Root Cause**: The heuristic looked for any group of 3 consecutive eighth notes without checking whether the measure actually needed tuplets.

**Fix** ([VexFlowHelpers.ts](file:///Users/lionelyu/Documents/New%20Version/ultimate-pianist-vex/components/score/VexFlowHelpers.ts)):
- Added `calculateVoiceDuration()` that sums all note durations (accounting for dots and existing tuplet modifications)
- `detectHeuristicTuplets()` now only triggers if `totalBeats > measureCapacity` — i.e., the voice overflows the time signature
- Extracted all logic into `VexFlowHelpers.ts` to keep the renderer lean

**Lesson**: Always validate the *need* for a heuristic before applying it. Check the math (total beats vs. measure capacity) first.

---

## 2. Fermata Positioning — Always Above Staff

**Problem**: Fermatas were appearing below the staff when stem direction was up, because the generic articulation positioning code placed them relative to the stem.

**Root Cause**: VexFlow stores articulation types as codes like `a@a` (fermata above), `a@u` (fermata below), etc. The original detection checked for the string `"fermata"` which never matched.

**Fix** ([VexFlowRenderer.tsx](file:///Users/lionelyu/Documents/New%20Version/ultimate-pianist-vex/components/score/VexFlowRenderer.tsx)):
```typescript
const artType = mod.type ?? ''
const isFermata = typeof artType === 'string' && artType.startsWith('a@')
if (isFermata) pos = 3 // always above
```

**Lesson**: VexFlow uses shorthand codes (`a.` for staccato, `a@a` for fermata, `a>` for accent). Always check VexFlow's `tables.js` for the actual code format.

---

## 3. Clef Changes — Staff 2 Treble Clef (M37-40)

**Problem**: When the left hand switches from bass to treble clef (M37), notes rendered in the wrong vertical position as if still in bass clef.

**Root Cause**: `createStaveNote()` hardcoded `staffIndex === 0 ? 'treble' : 'bass'`, ignoring clef changes.

**Fix** ([VexFlowHelpers.ts](file:///Users/lionelyu/Documents/New%20Version/ultimate-pianist-vex/components/score/VexFlowHelpers.ts)):
- Added `clefOverride` parameter to `createStaveNote()`
- Renderer passes the running clef (`currentTrebleClef`/`currentBassClef`) from the parser's clef tracking

**Lesson**: Never hardcode musical properties based on staff index. Always use the running state from the parser.

---

## 4. Slurs (Legato Curves) — New Feature

**Problem**: Slur curves (legato markings) were completely missing from the rendered output.

**Implementation** across 4 files:

| File | Changes |
|------|---------|
| [IntermediateScore.ts](file:///Users/lionelyu/Documents/New%20Version/ultimate-pianist-vex/lib/score/IntermediateScore.ts) | Added `slurStarts?: number[]` and `slurStops?: number[]` |
| [MusicXmlParser.ts](file:///Users/lionelyu/Documents/New%20Version/ultimate-pianist-vex/lib/score/MusicXmlParser.ts) | Parse `<slur type="start/stop" number="N"/>` from `<notations>` |
| [VexFlowHelpers.ts](file:///Users/lionelyu/Documents/New%20Version/ultimate-pianist-vex/components/score/VexFlowHelpers.ts) | `processSlurs()` — tracks active slurs via `ActiveSlurs` map, returns `Curve` objects |
| [VexFlowRenderer.tsx](file:///Users/lionelyu/Documents/New%20Version/ultimate-pianist-vex/components/score/VexFlowRenderer.tsx) | Calls `processSlurs()` per note, draws completed curves after ties |

**Key Design Decision**: Slurs use VexFlow's `Curve` (not `StaveTie`) because slurs are phrasing marks, not pitch-connecting ties. `Curve` renders as a bezier between two notes.

**Lesson**: Slurs can span multiple measures. The `activeSlurs` map persists across the measure loop.

---

## 5. Grace Notes — New Feature

**Problem**: Grace notes were skipped entirely by the parser (`if (child.querySelector('grace')) continue`).

**Implementation**:

| File | Changes |
|------|---------|
| [IntermediateScore.ts](file:///Users/lionelyu/Documents/New%20Version/ultimate-pianist-vex/lib/score/IntermediateScore.ts) | Added `isGrace?: boolean` and `graceNotes?: IntermediateNote[]` |
| [MusicXmlParser.ts](file:///Users/lionelyu/Documents/New%20Version/ultimate-pianist-vex/lib/score/MusicXmlParser.ts) | Collect grace notes in `pendingGraceNotes[]`, attach to next main note |
| [VexFlowHelpers.ts](file:///Users/lionelyu/Documents/New%20Version/ultimate-pianist-vex/components/score/VexFlowHelpers.ts) | `attachGraceNotes()` — creates `GraceNoteGroup` with slashed style |
| [VexFlowRenderer.tsx](file:///Users/lionelyu/Documents/New%20Version/ultimate-pianist-vex/components/score/VexFlowRenderer.tsx) | Calls `attachGraceNotes()` after creating each StaveNote |

**Key Details**:
- Grace notes have `<grace/>` element and **no `<duration>`** — set `durationDivs = 0`
- `pendingGraceNotes` resets per-measure (declared inside the measure loop)
- Grace notes are attached to the **next non-chord, non-grace note** in the same voice
- VexFlow's `GraceNote` constructor takes `slash: true` for acciaccatura style

**Lesson**: Grace notes steal visual space from the main note. This can cause alignment issues (see §6).

---

## 6. Cross-Stave Beat Alignment — The Hardest Bug

**Problem**: Notes at the same beat across treble/bass staves didn't align vertically. Particularly bad in M37 (treble clef on LH stave) and M38 (grace note on LH stave).

### What We Tried (in order):

#### ❌ Attempt 1: `formatter.format(voices, STAVE_WIDTH - 40)`
- Hardcoded width didn't account for clef/keysig decorations
- Notes overflowed past barlines on measures with lots of decorations

#### ❌ Attempt 2: Dynamic width via `getNoteEndX() - getNoteStartX()`
- Better, but didn't fix alignment because each stave had a *different* `noteStartX`
- The stave with more decorations started notes further right

#### ❌ Attempt 3: `formatToStave(voices, stave)` per stave
- Formatted each stave independently — no cross-stave alignment at all!

#### ❌ Attempt 4: Sync `noteStartX` + `Math.max` for width
- `Math.max(actual, STAVE_WIDTH - 60)` overrode the actual width with a too-large value
- Caused beat 3.5 notes to overflow past the barline

#### ✅ Final Fix: Sync `noteStartX` + tight width calculation
```typescript
// 1. Find the stave with the most decorations
const maxNoteStartX = Math.max(...staves.map(s => s.getNoteStartX()))

// 2. Force ALL staves to start notes at the same X
staves.forEach(s => {
    if (s.getNoteStartX() < maxNoteStartX) s.setNoteStartX(maxNoteStartX)
})

// 3. Calculate actual available width with right margin
const noteEndX = Math.min(...staves.map(s => s.getNoteEndX()))
const availableWidth = noteEndX - maxNoteStartX - 10

// 4. Format all voices together
formatter.format(vfVoices, Math.max(availableWidth, 100))
```

**Why This Works**:
- `setNoteStartX()` makes both staves begin their note area at the same X — decorations on one stave don't offset beats
- `format()` with all voices creates shared tick contexts — same beat = same X across staves
- `noteEndX - maxNoteStartX - 10` ensures notes never overflow past the barline

**Key Lesson**: For grand staff piano rendering, cross-stave alignment requires three things:
1. **Synchronized note start positions** across all staves
2. **All voices formatted together** (not per-stave)
3. **Tight width calculation** using actual stave geometry, not hardcoded values

---

## 7. Font Persistence — Race Condition on Page Refresh & Tab Switch

**Problem**: Saving a non-default font (e.g., Gonville) and refreshing the page would render the score in the *wrong* font. There was a consistent off-by-one shift — saving Gonville (#2) yielded Petaluma (#3), saving Petaluma (#3) yielded Academico (#4). Additionally, switching browser tabs and returning would lose the font entirely.

**Root Cause (Three-Part)**:

### Part A: `document.fonts.ready` lies

`VexFlowRenderer.tsx` preloaded fonts via `VexFlow.loadFonts(...)` then awaited `document.fonts.ready`. That promise resolves when all fonts *currently referenced in the DOM* are loaded — but since the VexFlow container is empty until `fontsLoaded = true`, the browser says "I'm ready!" immediately. When VexFlow renders the SVG with a fallback stack like `font-family="Gonville, Petaluma, Academico, Bravura"`, the browser hasn't actually downloaded Gonville yet, so it falls through to the next font in the stack (Petaluma).

**Fix**: Replace `document.fonts.ready` with explicit `document.fonts.load()` calls that force the browser to actually fetch each font file:

```typescript
Promise.all([
    document.fonts.load('30px "Bravura"'),
    document.fonts.load('30px "Gonville"'),
    document.fonts.load('30px "Petaluma"'),
    document.fonts.load('30px "Academico"')
])
```

### Part B: VexFlow ignores your "default" — it loads whatever it has

The initial state was `useState('Bravura')`, which called `VexFlow.setFonts('Bravura')` on the very first render. But **VexFlow does not care what you tell it to load initially** — it loads whatever font it has available internally, which is NOT Bravura. So the first render used VexFlow's actual internal default (not Bravura), but React's state already said `musicFont = 'Bravura'`. When the delayed `setMusicFont(data.music_font)` fired with `'Bravura'`, React saw "state is already `'Bravura'`" and **did not re-render**. The saved font never got applied.

**Fix**: Initialize `musicFont` as an empty string (`useState('')`) and only call `VexFlow.setFonts()` when the font is explicitly set. This way:
1. First render uses VexFlow's true internal default (no override)
2. After 1 second, `setMusicFont('Bravura')` fires → state changes from `''` to `'Bravura'` → triggers re-render → font loads correctly

### Part C: Tab switching kills fonts

Even after fixing A and B, switching to another browser tab and returning would lose the fonts. The browser unloads/garbage-collects web fonts when a tab is backgrounded. On return, VexFlow's SVG still references the font by name, but the browser no longer has the font data — so it silently falls back to whatever is available.

**Fix**: Listen for `visibilitychange` events. When the user returns to the tab, re-trigger the entire font loading sequence: reset `musicFont` to `''`, re-apply the saved font after 1 second. On the student-facing learn page, a 2-second blur overlay hides this process.

### Final Working Solution

**Strategy**: Never trust the initial font state. Always delay applying the saved font by 1 second to give fonts time to download. On the student page, show an opaque blur overlay for 2 seconds to hide the font swap entirely.

| File | Change |
|------|--------|
| [VexFlowRenderer.tsx](file:///Users/lionelyu/Documents/New%20Version/ultimate-pianist-vex/components/score/VexFlowRenderer.tsx) | `document.fonts.ready` → explicit `document.fonts.load()` per font; default prop `''` instead of `'Bravura'`; guard `setFonts()` behind `if (musicFont)` |
| [Admin page.tsx](file:///Users/lionelyu/Documents/New%20Version/ultimate-pianist-vex/app/admin/edit/%5Bid%5D/page.tsx) | `useState('')` instead of `useState('Bravura')`; delay `setMusicFont(data.music_font)` by 1s via `setTimeout` — admin sees the font swap, which is acceptable |
| [Learn page.tsx](file:///Users/lionelyu/Documents/New%20Version/ultimate-pianist-vex/app/learn/%5Bid%5D/page.tsx) | Same 1s font delay; hardcoded 2s blur overlay (`initialLoading` state) on mount AND on every `visibilitychange` (tab-switch-back); saved font stored in `savedFontRef` so the visibility handler can re-apply it |

**The learn page font reload sequence**:
```
Mount / Tab Return
  │
  ├─ t=0s:  setMusicFont('') → VexFlow renders with internal default
  │         setInitialLoading(true) → blur overlay visible
  │
  ├─ t=1s:  setMusicFont(savedFont) → re-render with correct font
  │
  └─ t=2s:  setInitialLoading(false) → blur overlay gone
            Student sees the score with the correct font, no swap visible
```

**Key Lessons**:
1. VexFlow's font system has two layers — VexFlow's internal font registry (`loadFonts`) and the browser's font cache (actual HTTP downloads). Both must be ready before rendering.
2. Never hardcode a default that masks a state change — if React thinks the state hasn't changed, it won't re-render.
3. Browser tabs are hostile to web fonts. Always re-initialize fonts on `visibilitychange` for any app that uses custom web fonts.
4. For student-facing UX, hide all font loading behind a timed overlay rather than relying on "ready" promises — those promises are unreliable.

---

## 8. Music Font Renders Wrong Glyphs Despite Being "Loaded" (April 2026)

**Problem**: On page load, the score renders with wrong-looking glyphs (not Bravura) even though:
- `document.fonts` confirms Bravura is loaded (`FontFace.status === 'loaded'`)
- `VexFlow.getFonts()` returns `['Bravura', 'Academico']`
- `getComputedStyle()` on SVG `<text>` elements shows `font-family: Bravura, Academico`
- Manually re-selecting the font from the dropdown (triggering a re-render) fixes it

**Root Cause (Three Layers)**:

### Layer 1: CSS Cascade Overrides SVG Presentation Attributes

Tailwind's `font-sans` class on `<body>` generates a CSS rule like `font-family: 'Geist', 'Geist Fallback'` with specificity `0,1,0`. SVG presentation attributes (e.g., `font-family="Bravura,Academico"` set by VexFlow on `<text>` elements) have **zero specificity** (`0,0,0`). The CSS rule wins, so all SVG text renders with Geist instead of Bravura.

**Fix (globals.css)**:
```css
.vexflow-container {
    font-family: initial;
}
```
This breaks the CSS font cascade at the container boundary.

### Layer 2: VexFlow's `applyAttributes()` Skips Duplicate Font Attributes

DreamFlow's `SVGContext.applyAttributes()` method (svgcontext.ts:315-330) compares attributes against the parent group's attributes and **skips setting font-family on `<text>` elements when it matches the parent group**. This optimization means many `<text>` elements have NO `font-family` attribute at all and rely entirely on CSS inheritance — which is broken by Layer 1.

**Fix (dreamflow — svgcontext.ts `fillText()`)**: After `applyAttributes()`, force font properties as **inline styles** on every `<text>` element:
```typescript
// In fillText(), after applyAttributes(txt, attributes):
const fontFamily = attributes['font-family'];
const fontSize = attributes['font-size'];
if (fontFamily || fontSize) {
    let style = '';
    if (fontFamily) style += `font-family:${fontFamily};`;
    if (fontSize) style += `font-size:${fontSize};`;
    // ...fontWeight, fontStyle
    txt.setAttribute('style', style);
}
```
Inline styles have the highest CSS specificity and cannot be overridden by external CSS.

### Layer 3: Browser Glyph Shaping Delay for Private Use Area Characters

Even with Layers 1 and 2 fixed, the first render still shows wrong glyphs. The browser registers the font as "loaded" in `document.fonts`, but **glyph shaping for Private Use Area (PUA) codepoints** (where SMuFL music symbols like noteheads live: U+E000–U+F8FF) **isn't complete until a subsequent layout pass**. The browser needs one full layout cycle to map PUA codepoints to the correct font's glyph outlines.

This is a fundamental browser behavior — not a bug in VexFlow or dreamflow. It affects any web font that uses PUA characters.

**Fix (VexFlowRenderer.tsx)**: Force a second render after 300ms and keep the score invisible until the second render completes:
```tsx
const [fontSettled, setFontSettled] = useState(false)
const hasInitialRenderedRef = useRef(false)

useEffect(() => {
    renderScore()
    if (!hasInitialRenderedRef.current && fontsLoaded && score) {
        hasInitialRenderedRef.current = true
        const timer = setTimeout(() => {
            renderScore()        // Re-render with correct glyph shaping
            setFontSettled(true)  // Now show the score
        }, 300)
        return () => clearTimeout(timer)
    } else if (hasInitialRenderedRef.current) {
        setFontSettled(true)
    }
}, [renderScore, fontsLoaded, score])

// In the JSX:
// opacity: (isRendered && fontSettled) ? 1 : 0
```

### Layer 4: Font Save Race Condition (bonus)

`useMusicFont` delays setting `musicFont` state by 1 second for toggle-triggered re-renders. If the user changes the font dropdown and hits Save within that window, the old/stale `musicFont` state was saved to DB.

**Fix**: Expose `savedFont` (from the ref, always immediately up-to-date) from the hook and use it in `handleSave` instead of the delayed `musicFont` state.

### Understanding Bravura + Academico Font Pairing

DreamFlow's `setFonts('Bravura', 'Academico')` creates the CSS font stack `font-family: Bravura, Academico`. These are two different fonts with different roles:
- **Bravura** = music glyph font (noteheads, clefs, accidentals, rests — all in Unicode Private Use Area)
- **Academico** = text font (dynamic markings "pp"/"ff", tempo text, lyrics — regular Latin characters)

The browser tries Bravura first for each character. Music symbols (PUA) are found in Bravura. Regular text characters (Latin) fall through to Academico. This is intentional — do not separate them.

### Files Changed

| File | Change |
|------|--------|
| `app/globals.css` | Added `.vexflow-container { font-family: initial; }` to block CSS cascade |
| `dreamflow/src/svgcontext.ts` | Force inline `style` on `<text>` elements in `fillText()` |
| `dreamflow/build/esm/src/svgcontext.js` | Same fix in built ESM output |
| `components/score/VexFlowRenderer.tsx` | 300ms re-render + `fontSettled` visibility gate; `fontsReady` polling |
| `hooks/useMusicFont.ts` | Expose `savedFont` ref for immediate font value |
| `app/studio/edit/[id]/page.tsx` | Use `savedFont` in `handleSave` |
| `dreamflow/entry/vexflow.ts` | Export `fontsReady` promise (not used by consumer yet due to pnpm) |

### Key Lessons (New)

5. SVG presentation attributes have **zero CSS specificity**. Any CSS class rule (even inherited from `<body>`) overrides them. Always use inline styles for font properties on SVG `<text>` elements when CSS frameworks are in play.
6. `document.fonts.check('30px "Bravura"')` returns `true` **vacuously** when no matching FontFace exists. Iterate `[...document.fonts]` and check `ff.family === 'Bravura' && ff.status === 'loaded'` for reliable verification.
7. Browser glyph shaping for PUA codepoints (SMuFL music fonts) requires a layout reflow after font load. A 300ms delayed re-render with visibility gating is the standard workaround.
8. When using debounced state for rendering, always expose the immediate ref value for save operations to avoid race conditions.
9. pnpm's content-addressable store means editing `node_modules/pkg/file.js` may not affect the actual file the bundler reads. Always find the real file under `node_modules/.pnpm/...`.

---

## 9. MusicXML Articulation Placement — Preprocessing Fix (April 2026)

**Problem**: Staccato dots and tenuto marks appear on the wrong side of noteheads when MusicXML is exported from notation software like Sibelius. The correct engraving rule is:
- **Stem down** → articulation on **top** of the notehead (above)
- **Stem up** → articulation on **bottom** of the notehead (below)

Sibelius (and many other notation editors) export `<staccato />` and `<tenuto />` elements **without a `placement` attribute**, leaving it up to the renderer to guess. Some renderers get it wrong.

**Root Cause**: The MusicXML spec defines an optional `placement` attribute on articulation elements (`above` or `below`). When omitted, the rendering application chooses — and not all renderers follow the standard engraving convention. The stem direction is already encoded in the `<stem>` element of each `<note>`, but articulations don't reference it.

**Example — Before Fix**:
```xml
<note>
    <pitch><step>C</step><octave>3</octave></pitch>
    <duration>256</duration>
    <voice>2</voice>
    <type>quarter</type>
    <stem>up</stem>          <!-- stem is UP -->
    <notations>
        <articulations>
            <staccato />     <!-- no placement — renderer guesses wrong -->
        </articulations>
    </notations>
</note>
```

**Example — After Fix**:
```xml
<staccato placement="below" />   <!-- stem up → placement below -->
```

**The Fix — MusicXML Preprocessing Function**:

This should run as an intermediate step between fetching the MusicXML text and passing it to the parser. It operates on the raw XML DOM before any VexFlow conversion.

```typescript
/**
 * Preprocesses MusicXML to fix articulation placement based on stem direction.
 * 
 * Many notation editors (Sibelius, Finale, MuseScore) export <staccato/> and
 * <tenuto/> without a placement attribute. This function reads the <stem>
 * direction from each <note> and sets the correct placement:
 *   - stem "down" → placement="above" (articulation on top of notehead)
 *   - stem "up"   → placement="below" (articulation on bottom of notehead)
 * 
 * @param xmlDoc - Parsed XML Document (from DOMParser)
 * @returns The same document, mutated in place with placement attributes added
 */
function fixArticulationPlacement(xmlDoc: Document): Document {
    const notes = xmlDoc.querySelectorAll('note')
    
    for (const note of notes) {
        const stem = note.querySelector('stem')
        const articulations = note.querySelector('notations > articulations')
        if (!stem || !articulations) continue

        const stemDir = stem.textContent?.trim()
        let placement: string | null = null
        if (stemDir === 'down') placement = 'above'
        else if (stemDir === 'up') placement = 'below'
        else continue

        for (const art of articulations.children) {
            const tag = art.tagName
            if (tag === 'staccato' || tag === 'tenuto') {
                art.setAttribute('placement', placement)
            }
        }
    }
    
    return xmlDoc
}
```

**Where to Integrate**: In `MusicXmlParser.ts`, call this function right after `DOMParser().parseFromString()` and before any note iteration begins. The function mutates the DOM in place, so the existing parser code doesn't need changes — it just receives a cleaner document.

```typescript
// In parseMusicXmlString():
const parser = new DOMParser()
const xmlDoc = parser.parseFromString(xmlText, 'application/xml')

// ← INSERT HERE: Fix articulation placement before parsing
fixArticulationPlacement(xmlDoc)

// ... rest of existing parsing logic
```

**Current Rendering Workaround**: The VexFlow renderer in `VexFlowRenderer.tsx` (lines 535-551) already has a **post-format repositioning pass** that sets articulation position based on `stemDir` after VexFlow assigns stems. This means DreamPlay Composer renders articulations correctly regardless of MusicXML placement attributes. However, the preprocessing fix is still valuable because:

1. **Other consumers** of the MusicXML (e.g., re-export, other renderers) benefit from correct placement in the source XML
2. **Semantic correctness** — the XML should encode the correct placement rather than relying on each renderer to fix it
3. **Eliminates redundant work** — if placement is already correct in the XML, the post-format repositioning pass becomes a no-op rather than a correction

**Affected Articulations**: Currently fixes `staccato` and `tenuto`. Can be extended to `accent`, `strong-accent`, `staccatissimo`, etc. Fermatas are excluded — they always go above the staff regardless of stem direction (handled separately in dreamflow).

**Key Lesson**: When importing MusicXML from third-party editors, never trust that optional attributes are present. Preprocess the XML to normalize missing attributes based on other data already in the document (like stem direction). This is cheaper than fixing rendering artifacts downstream.

