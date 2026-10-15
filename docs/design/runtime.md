# Runtime and integration boundaries

[Design index](index.md)

[Surface-specific patterns](surfaces.md) limit generic rules for popup, timeline, canvas, and embedded UI. These constraints retain product requirements that the control specimens cannot prove. Read this document for runtime shells, portals, embedded UI, or a cross-editor rollout.

## Existing owners

Use existing @sniptale/ui primitives when they provide the required behavior. Reusable visual and interaction behavior belongs to the shared UI owner. Feature-specific content stays with its runtime or feature. @sniptale/ui/styles/design-tokens owns semantic values. Product i18n owners own translated strings. Do not copy prototype constants into feature-local tokens. Numeric specimen values demonstrate direction rather than replacing production token ownership.

Apply extension theme state at the runtime root and pass it to portals and detached roots through existing helpers. Do not infer extension theme from the browser or host page. Content-script UI preserves its established Shadow DOM, portal, focus, and listener owners. Host CSS, page background, stacking context, scroll position, and zoom must not determine its readability or input ownership.

## Layout contracts

Desktop application surfaces retain their 1280 CSS-pixel minimum width. Narrower desktop windows can scroll horizontally rather than silently switching to a mobile application layout. Popup, embedded, exported, and reference-catalog surfaces retain their own sizing contracts. The reference sheet can stack its two theme columns without prescribing a product breakpoint.

At the runtime's minimum dimensions, keep the title, current selection, primary command, blocking status, and recovery reachable. Use actual scroll owners and separate nested scrolling only for separate tasks with keyboard access. Keep inspector commands relevant to the selected object. Do not add permanent explanatory paragraphs to compact inspectors without a task need. Preserve docking, resizing, and intermediate layout frames. Text zoom must not remove recovery or footer access.

## State, feedback, and cleanup

Each transient layer and gesture has one activation, dismissal, cleanup, capture, Escape, and focus owner. Route pointer and keyboard activation to the same state transition. A selection-commit click must not activate the surface underneath the active layer. Closing an editing mode restores its previous interaction mode and suspended shortcuts.

Do not leave listeners, capture, or pressed state active after dismissal.

After a pointer gesture, retain a valid keyboard target within its surface. Preserve focused child controls and deliberate focus outside that surface. Drawing gestures must not trigger an unrelated blur commit through browser default focus movement.

Separate explicit user commands from asynchronous component feedback. Feedback from an earlier operation must not submit or dismiss a newer editor. Preserve the existing feedback transition without repeating command admission against the current draft.

Distinguish unsaved, saving, and failed edits. Show saved feedback when the committed result is not otherwise visible. Selection is not a saved-state indicator. Keep failures explicit and preserve recoverable data. User-facing feedback must not expose raw exceptions, internal identifiers, secrets, or retained page content.

## Rollout evidence

Inventory each reachable group, conditional branch, nested editor, list, and footer before cross-editor implementation. Map each consumer to a reference, supported dimensions, states, proof, and remaining gaps. Code inspection does not establish a rendered result. Resolve established deviations before declaring coverage complete. Technical checks do not replace comparison with the agreed composition.
