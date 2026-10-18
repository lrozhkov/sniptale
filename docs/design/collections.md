# Collections and objects

[Working example](../../tooling/design-reference/examples/collections/index.html) · [Foundations](foundations.md)

## Separate user intents

| Intent | Pattern |
| --- | --- |
| Select objects for a batch operation | Leading checkbox |
| Open an object | Title or a separate open command |
| Choose one resource for a property | Single-choice list or labeled visual card |
| Filter categories | Independent selection, even with immediate results |
| Reorder | Existing drag and keyboard reorder owner |
| Change current visibility | Existing visibility action, separate from export inclusion |

Navigation metadata, including item numbers and time intervals, belongs inside the jump action. Expansion stays separate.

Checkbox clicks never open items. Card appearance does not imply batch selection. Single-selection notes/comments retain their selected row, hover preview, inline composer, and selected-only commands without specimen-driven checkboxes.

The composer owns its draft until Save or Cancel. The specimen locks row switching during editing. Product adaptation must not silently discard drafts.

## Row geometry

Align equivalent rows: leading controls, titles, metadata, and trailing actions. Two-line object rows start at 56px and grow for long titles. Titles use ordinary weight. Metadata uses the shared caption role, readable secondary foreground, and normal text contrast. Only decorative/unavailable content uses dim text. Hit regions stay contiguous. Inset selected/hovered surfaces 1px vertically for a 2px separator.

Separate objects never merge into selected blocks or acquire dead click gaps. Cards retain grid gaps and meaningful preview names. Metadata contains type/storage-class indicators outside artwork. Apply the expiry rules below. Preserve transient selection targets and virtual geometry. Reserve trailing space only for real actions. Info must not repeat visible metadata. Secondary actions support focus, hover, and supported touch flows.

Diagnostic tables retain compact geometry without the 56px minimum. Columns stay stable across value changes. Opaque sticky headers prevent scrolled text overlapping labels.

Wrap long diagnostic values within columns. Tables own horizontal scrolling below their minimum width. Preserve complete readable values and export data.

Ordinary settings collections stop at 960px. Wide diagnostic tables retain their scroll region. Titles, metadata, and actions must read as one row.

Pointer reorder shows the pending slot before release and moves adjacent rows aside. Opaque dragged rows must not overlap neighboring text or position lines. Release commits once. Escape, pointer cancellation, or window blur restores order without persistence.

## Selection and batch scope

Name Select all scope: filtered results, page, or project. Parent empty/check/dash states describe that scope. Individual checkboxes describe their item. Ordering and expansion stay separate. The specimen selects available filtered items, retains hidden selections in batch actions, and shows total/filtered counts. Batch counts must agree.

Preserve filtering, sorting, and paging policy without inventing gestures. The specimen's bounded Shift-click gesture does not establish full gallery keyboard parity. Removal preserves valid selection and logical focus. Sample Undo restores the last batch without replacing production history.

## Empty, unavailable, and failure

Distinguish empty libraries, zero matches, loading, unavailable data, and failures. Offer acquisition for empty libraries and the established Add menu for existing collections. Failure retains filter text, valid selection, and retry. Never report failure as an empty success. Explain selection limits without clearing other choices.

Preserve row geometry and accepted state for unavailable objects.

## Resource selection

Media properties provide a preview, computer/library acquisition, replacement, cancellation, and pending/error feedback. Single-resource contracts replace batch checkboxes. Failure preserves accepted resources. Decoding, permissions, media lifetime, and persistence retain existing owners. See [Compositions](compositions.md) for adjoining controls and [Layers](layers.md) for acquisition surfaces.

Existing integration owners include media-library-list, gallery selection-bar, and material-browser/selectable-card.

Creation remains the primary date, including project cards without generic editable-project filler. Automatic-removal deadlines appear separately: trailing header icons/native titles in grids, below creation dates in tables. Unknown expiry is not zero. Recording groups use their earliest known expiry. Preserve unavailable/restore notices.

Library grid selection replaces the type icon in the bottom caption. Show the type icon at rest, the selection circle on caption hover or focus, and the selected mark until deselection. Keep the preview free of selection overlays. Use a 24px disc inside a transparent 32px target, without a square backing. Preserve selection, open, and range gestures as separate actions. Automatic-removal icons use the same warning color as the inspector deadline. A compact translucent backing with rounded corners keeps them readable over captured pixels.

Balance visible left/bottom insets of lower-leading caption selection targets. Reserve keyboard-frame clearance. Metadata uses remaining width and shows complete dates/sizes at supported grid widths.

Large-grid footers align the type/selection indicator and any open command with the title row. Put the creation date and size on the second row. Align the date with the title text and the size with the trailing edge. Keep a 4px gap between the 24px title band and the metadata row. Preserve 32px command targets, compact-grid composition, and virtual card height.
