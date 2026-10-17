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

A checkbox click must not also open the item. Do not infer batch selection from a gallery card's appearance. Single-selection notes or comments do not acquire checkboxes merely to match a collection specimen. Preserve their selected row, hover preview, inline composer, and selected-only commands.

The inline composer owns its draft until Save or Cancel. The specimen locks row switching while editing. Do not discard a draft silently when adapting the actual product selection contract.

## Row geometry

Align leading controls, titles, metadata, and trailing actions across equivalent rows. Two-line object rows have a 56px minimum height. Long titles can increase height. Use the ordinary weight for titles. Secondary metadata uses the shared caption role and readable secondary foreground. Reserve dim text for decorative or unavailable content. Meaningful metadata must meet the normal text contrast requirement. Keep hit regions contiguous. Paint selected and hovered surfaces 1px inside each vertical edge, creating a 2px visual separator.

Do not merge separate objects into a selected block or create dead click gaps between them. Cards retain their grid gaps and meaningful preview names. Keep persistent type and storage indicators in metadata, outside the artwork. Preserve transient selection targets and the existing virtual row geometry. Reserve trailing action space only when a real action exists. Do not add Info that repeats visible metadata. Secondary actions appear on focus as well as hover and remain available on supported touch flows.

Diagnostic tables use their own compact geometry. The 56px object-row minimum does not apply to table rows. Keep column widths stable when values change. Sticky headers need an opaque background so scrolled text cannot overlap their labels.

Wrap long diagnostic values inside their columns. Horizontal scrolling must belong to the table region when its minimum width exceeds the available space. Preserve complete readable values and export data.

Ordinary settings collections use a maximum width of 960px. Wide diagnostic tables retain their own scroll region. Keep titles, metadata, and actions close enough to read as one row.

During pointer reorder, show the pending slot before release. Move adjacent rows to make space. Do not draw the dragged text over another row or a position line. Keep the row surface opaque during motion. Release commits once. Escape, pointer cancellation, or window blur restores the original order without a persistence command.

## Selection and batch scope

Name Select all scope: filtered results, page, or project. Parent empty/check/dash states describe that scope. Individual checkboxes describe only their own item. Keep ordering and expansion separate from selection. The specimen selects available filtered items. Hidden selected items remain selected and participate in batch actions. Its summary exposes total and filtered selection counts. Batch action counts must agree.

Preserve the product policy when filtering, sorting, or paging. Do not invent selection gestures during styling. The specimen's Shift-click range demonstrates an existing bounded gesture, not full gallery keyboard parity. After removal, preserve valid selection and move focus logically. Undo restores the last sample batch without replacing production history ownership.

## Empty, unavailable, and failure

Distinguish an empty library from zero filter matches, loading, unavailable data, and failed loading. Offer acquisition when no resources exist. Use the established Add menu for an existing collection. Failure retains filter text, valid selection, and retry access. Do not present failure as a successfully empty list. Explain selection limits without silently clearing other choices.

Preserve row geometry and accepted state for unavailable objects.

## Resource selection

Media properties need a current preview, computer/library acquisition, replacement, cancellation, and pending/error feedback. Use a single-resource contract rather than batch checkboxes. Failure preserves the accepted resource. Decoding, permissions, media lifetime, and library persistence retain their existing owners. Use [Compositions](compositions.md) for the adjoining property controls and [Layers](layers.md) for acquisition surfaces.

Existing integration owners include media-library-list, gallery selection-bar, and material-browser/selectable-card.
