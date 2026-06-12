---
name: page-edit-mode
description: Add a Canva-style visual Edit Mode to any single-page HTML proposal, landing page, sales page, or long-scroll editorial document (NOT a slide deck). Use this skill EVERY TIME you create, generate, or finish building an HTML proposal, sales page, landing page, hero page, or single-page document for the user - inject the editor automatically as the final step. Also triggers when the user asks to "make this page editable", "הוסף עריכה לעמוד", "אפשר לי לערוך את ההצעה", "edit mode for landing page", or wants to edit text/colors/images in an existing single-page HTML.
---

# Page Edit Mode

In-browser visual editor for single-page HTML proposals, landing pages,
and editorial-style scrolling documents. Adds an "✏️ עריכה" button that
lets the user edit text inline, recolor anything, paste screenshots,
undo/redo, autosave to localStorage, and download the edited HTML.

No server, no dependencies, no build step. Everything stays inside the
single HTML file.

## When to use page-edit-mode vs deck-edit-mode

Two sister skills. Pick by HTML structure:

| Use **page-edit-mode** when | Use **deck-edit-mode** when |
|---|---|
| Single scrolling page with `<section>` elements | `<div id="deck">` with `.slide` children, one `.active` at a time |
| Flow layout (grid, flex, normal block flow) | Absolute positioning inside a scaled stage |
| Proposals, landing pages, sales pages, articles, marketing one-pagers | Pitch decks, presentations, slide-based stories |

Unsure? Grep the file for `class="slide"` — if present, use deck-edit-mode.

## When to run

1. **Automatically** — after creating or significantly rebuilding any
   single-page HTML proposal/landing page for the user, inject the editor
   as the final build step.
2. **On request** — when the user asks to make an existing page editable.

## How to inject

```bash
python3 <skill-dir>/scripts/inject_editor.py path/to/page.html
```

The script is idempotent: running it again upgrades the editor in place.
It strips any leftover `deck-edit-mode` block first (prevents `#ed-fab`
collisions), then appends editor CSS before the last `</style>` and the
editor JS before `</body>`. Always keep a backup before the first injection.

## Feature parity vs deck-edit-mode

**Kept:**

- ✏️ floating Edit button (bottom-right, terra/ink palette)
- Inline text edit on double-click (Escape cancels with revert)
- Color swatches: whole element OR selected word; gradient on text
- Paste screenshot (Cmd+V) or drag image file from desktop
- Internal Cmd+C / Cmd+V / Cmd+D to clone elements
- Undo / Redo (per-section innerHTML snapshots, 80-deep)
- Autosave to localStorage with restore bar
- 💾 Save / Cmd+S → downloads `<name>-edited.html`
- Counter baking + URL absolutization at export

**Removed (intentionally — doesn't make sense in flow layout):**

- Drag-to-move (flow elements don't have free coordinates)
- Snap-guides + center buttons (no fixed canvas center)
- Arrow-key nudge
- Blur / shape elements
- Z-order buttons
- `show(idx)` slide navigation

**Changed:**

- Save model keyed by `<section id>` (with `[data-edit-id]` and
  generated `sec-N` index fallback), not by slide index
- Canvas root is configurable via `window.__brainEdConfig.rootSelector`;
  default scan order is `[data-edit-root]` → `<main>` → `<body>`
- Default palette is terra + ink (3pel/AI brand); override via
  `window.__brainEdConfig.colors`
- New elements (`addImage`, `addText`, paste) inserted as flow elements
  AFTER the current selection (not absolutely positioned)

## Configuration

To override defaults, add this `<script>` BEFORE the injected editor:

```html
<script>
window.__brainEdConfig = {
  rootSelector: '#proposal',
  colors: [
    ['brand',  '#0F62FE'],
    ['accent', '#FA4D56'],
    ['mute',   '#6F6F6F']
  ],
  gradient: 'linear-gradient(135deg,#0F62FE,#FA4D56)'
};
</script>
```

If you skip this, the editor uses 3pel/AI defaults: ink (`#1A2238`),
terra (`#C8503D`), cream (`#F7F1E5`).

## What the user gets (tell them after injecting)

- ✏️ עריכה button toggles edit mode
- Click = select · double-click = edit text (Escape cancels)
- Cmd+V paste screenshot · drag image file from desktop
- Cmd+C copy element · Cmd+V paste · Cmd+D duplicate
- Toolbar: add image · add text · ⤴ select parent · font size · color
  swatches (full element OR selected word) · delete · undo · redo
- Cmd+Z undo · Cmd+Shift+Z redo · Delete/Backspace removes selection
- Autosave to the browser; a restore bar appears if work was lost
- 💾 שמור / Cmd+S downloads `<name>-edited.html` — the user replaces the
  original file with it. Background images, fonts and animated counters
  are preserved (URLs absolutized, counters baked at export).

## Verify after injecting

ALWAYS verify post-injection:

1. Page still renders identically (no layout regression)
2. ✏️ button visible bottom-right
3. Clicking it opens the toolbar
4. Edit mode auto-test: append `?edtest=1` to the URL — editor opens
   immediately so you can headless-screenshot it for verification

If anything looks broken, restore the backup.

## Auto-injection for every future proposal

On first install, offer the user to add this line to their project's
CLAUDE.md so the behavior survives across sessions:

```
After creating any single-page HTML proposal / landing page / editorial document, inject Page Edit Mode:
python3 .claude/skills/page-edit-mode/scripts/inject_editor.py <page.html>
```
