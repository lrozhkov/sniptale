# Numeric controls

[Working example](../../tooling/design-reference/examples/numbers/index.html) · [Foundations](foundations.md)

## Choose the editor

Use a numeric field for exact values with units, bounds, and meaningful precision. Use a range when its continuous bounded mapping helps comparison. Do not use a slider for arbitrary named modes. An ordinary slider is visible. A contextual slider supplements an inspector value on hover or range focus. A repeat stepper belongs to the numeric owner. It is not an ordinary command button.

Preserve the product mapping, units, precision, snapping, valid boundaries, and accepted off-step values.

## Row geometry and hierarchy

Parameter names remain secondary. Values and units remain primary with tabular digits where useful. Hover paint belongs to the editable value, not the name or whole row. Align visible numeric and color value edges. Keep alignment stable when steppers appear or editing starts. Ordinary forms retain the shared 32px control. The explicit compact inspector uses a 40px row for every equivalent parameter. Its first band contains a 32px control. Its lower 8px strip contains contextual tools. Keep the slider target and thumb clear of label text and the next row. Use a 3px painted track. Wrapped names can increase this allocation. Hover does not change row height or add margins to the group's 4px gap. The lower slider target remains separate from the direct label/value editing targets and cannot overlap the next parameter.

The exact editable value is the equivalent pointer and keyboard control for the smaller supplementary strip. Do not apply that target exception to a standalone slider. At narrow widths, wrap a label or stack its value before text becomes unreadable. Prevent local clipping.

## Editing and acceptance

Only the numeric input and its actual padding activate editing. Parameter names and row gaps do not focus or activate controls. Keep the accessible name through aria-labelledby. Clicking inside the input retains editing. Preserve accepted values separately from previews and drafts. Validate before acceptance. Enter accepts valid input. Escape restores the accepted value in the sample.

Invalid blur retains the invalid draft and error without changing the accepted value. Keep a valid custom off-step value unless the domain explicitly requires quantization. Do not accept an invalid intermediate string or silently replace it with a bound. Record any different product commit/blur behavior before integration.

## Contextual slider

Reveal the contextual slider during row hover, range focus, or dragging. Hide it during direct numeric editing, even while the pointer stays over the row. Restore it after editing ends only when hover or range focus requires it. Forward Tab after a valid edit can reach the sample range. Shift+Tab returns to the value.

Provide an equivalent keyboard route in the actual product owner. Use the same theme accent for ordinary and contextual fills and thumbs. Keep the retained thin neutral unfilled track. Do not restore the rejected heavy contrast track. Its final contrast decision remains open. Keep position and fill synchronized during keyboard and pointer changes.

## Hold, interruption, and recovery

Only the explicit stepper repeats. The specimen uses 220ms before repeat and 70ms between steps. Stop repetition on release, cancellation, focus loss, or a boundary. Scrubbing and range drags retain capture, preview, commit, and cancel ownership. Canceled gestures preserve the accepted value. Do not leave drag or pressed feedback active.

Errors remain visible and copyable, associated with the field, and do not hide neighboring recovery controls.

[WAI slider](https://www.w3.org/WAI/ARIA/apg/patterns/slider/).

## Explicit domain variants

NumericField accepts separate scrubMin/scrubMax and typed min/max bounds. A valid value outside the scrub range remains accepted. Show the out-of-scale caption and omit an exact-position thumb. Focusing and leaving the range without editing must not clamp that value. A deliberate range edit selects within scrub bounds. Text arrows retain the wider typed domain.

Use editable=false for a range-only setting. Its value remains read-only while the range supports pointer and keyboard input.

Keep units visible outside the editable text during focus and draft changes. The editor can expand toward the leading edge while its trailing unit edge stays fixed. Give short values a comfortable minimum of 5ch during editing. Keep leading inner space when longer drafts expand the editor. Do not compress the editor to its current digits or reserve an oversized fixed width. Use the same light neutral 1px boundary and input surface as inline text and HEX editors. On initial focus in an editable numeric field, select the complete value. Support pointer and keyboard activation of the input. A later click inside the focused field can place the caret. Keep the contextual slider hidden during text editing.

Place the 20px stepper at the trailing edge with absolute positioning. Reveal it contextually. Do not reserve an empty trailing gutter at rest. It can extend up to 8px into a verified surrounding gutter. Keep it inside the viewport and clear of adjacent controls. Keep arrows near their value. Pointer focus retains a neutral surface. Keyboard focus uses a visible 1px frame.
