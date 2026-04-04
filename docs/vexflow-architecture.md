# VexFlow Rendering Architecture

## Module map

```
components/score/
├── VexFlowRenderer.tsx       ← React shell (font load, stave creation, measure loop)
├── VexFlowNoteBuilder.ts     ← Note objects (StaveNotes, beams, ties, slurs, tuplets)
├── VexFlowFormatter.ts       ← Format + draw (layout, spacing, articulation, tuplets)
├── VexFlowPostRender.ts      ← Post-render (DOM caching, CSS, onRenderComplete)
└── VexFlowHelpers.ts         ← Constants, pure helpers, shared types
```

---

## Where to make changes

### VexFlowRenderer.tsx (~270 lines)
**React component shell.** Owns the lifecycle and the per-measure stave loop.

Add logic here for:
- New React props (dark mode, font selector, zoom)
- Font loading behavior changes
- New stave decorations: repeat barlines, mid-score clef/key/meter changes
- Resize behavior
- Changing how `onRenderComplete` data is assembled

**Do NOT** add note-creation or draw logic here — push it to the appropriate module below.

---

### VexFlowNoteBuilder.ts (~260 lines)
**Pure transformation: IntermediateVoice → VexFlow objects.**

Add logic here for:
- New note modifiers: dynamics (p, f, ff), fingering numbers, trills, ornaments
- Beaming rule changes (new time signatures, triplet beaming, cut-time grouping)
  - Edit the beam-bucketing section (`beamableWithBeat` / `beatBuckets`)
- Accidental display changes
- Grace note rendering
- Slur / tie spanning logic changes
- Heuristic tuplet detection changes

Key invariant: this module **must not draw** — it only builds objects and returns them.

---

### VexFlowFormatter.ts (~200 lines)
**Takes built VexFlow objects and runs format + draw.**

Add logic here for:
- Note spacing / available-width calculation changes
- Articulation repositioning rules (new articulation types, position overrides)
- Tuplet visual appearance (bracket on/off, number size/position, text transform)
- Proportional spacing adjustments for tuplet measures
- New ornament types that need post-format drawing passes
- Stem direction overrides that need to happen after `formatter.format()`

Key invariant: this module receives already-built objects. It should not create new `StaveNote` objects.

---

### VexFlowPostRender.ts (~115 lines)
**Runs in `requestAnimationFrame` after all SVG drawing is complete.**

Add logic here for:
- New CSS properties on note elements (e.g. `will-change`, new transition targets)
- `absoluteX` calculation changes (e.g. different anchor for grace-note-bearing notes)
- New coordinate maps to expose via `onRenderComplete`
- Additional DOM queries needed for animation effects in ScrollView
- Removing the FONT DEBUG block once font loading is confirmed stable

---

### VexFlowHelpers.ts (~360 lines)
**Constants, pure helpers, shared types. No VexFlow drawing code.**

Add here:
- New layout constants (`STAVE_WIDTH` formula, `SYSTEM_HEIGHT`, margins)
- `getMeasureWidth()` formula adjustments
- New note helper functions used by multiple modules
- Shared type definitions (`TieRequest`, `TupletSpec`, `NoteData`, `VexFlowRenderResult`)
- `durationToBeats()`, `isBeamable()`, `createStaveNote()` and similar pure utilities

---

## Data flow

```
IntermediateScore
       │
       ▼
VexFlowRenderer (per measure loop)
  │
  ├─► createStave()  [renderer, local]
  │
  ├─► buildVoiceNotes()  [VexFlowNoteBuilder]
  │     Returns: vfVoice, beams, tuplets, tieRequests,
  │              coordinateExtractors, pendingNoteData
  │
  ├─► formatAndDrawMeasure()  [VexFlowFormatter]
  │     Mutates: stave X positions, note X shifts
  │     Draws:   voices, beams, tuplets to SVG context
  │
  └─► coordinateExtractors() run → pendingNoteData evaluated
        ↓
      allNoteData populated

After all measures:
  │
  ├─► StaveTie.draw() for all tieRequests
  ├─► Curve.draw() for all slurs
  │
  └─► runPostRender()  [VexFlowPostRender]
        Sets CSS on elements, caches absoluteX,
        fires onRenderComplete({ measureXMap, beatXMap, noteMap, ... })
```

---

## Known constraints

- **Beat position tracking**: `note.beat` is 1-indexed (`beat=1.0` = first beat). The beaming formula `Math.floor((note.beat - 1) / beamGroupBeats)` relies on this. Changing to 0-indexed would break beaming.
- **Tick ratio for tuplets**: VexFlow v5 `Tuplet` constructor does NOT apply tick corrections. `applyTickMultiplier(normal, actual)` must be called manually in `VexFlowFormatter.ts` before the `Tuplet` is created.
- **autoStem rule for beams**: Single-voice staves use `autoStem=true` so VexFlow picks a consistent stem direction for the whole beam group. Multi-voice staves use `autoStem=false` because `stemDir` is pre-set per note in `buildVoiceNotes`.
- **Cross-measure ties**: `prevMeasureLastNotes` is mutated in-place across measures inside `buildVoiceNotes`. The actual `StaveTie.draw()` happens after the full measure loop so all stave positions are finalized.
- **measureXMap stores stave left edge** (not note-start X). ScrollView uses this for measure marker label positions.

---

## Bug fix documentation

See `/docs/vexflow-rendering-fixes.md` for a log of past bugs, their root causes, and solutions.
