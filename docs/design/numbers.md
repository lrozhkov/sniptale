# Numeric controls

[Working example](../../tooling/design-reference/examples/numbers/index.html) · [Foundations](foundations.md)

## Choose the editor

Use a numeric field for exact values with units, bounds, and meaningful precision. Use a range when its continuous bounded mapping helps comparison. Do not use a slider for arbitrary named modes. An ordinary slider is visible. A contextual slider supplements an inspector value on hover or range focus. A repeat stepper belongs to the numeric owner. It is not an ordinary command button.

Preserve the product mapping, units, precision, snapping, valid boundaries, and accepted off-step values.

## Row geometry and hierarchy

Parameter names remain secondary. Values and units remain primary with tabular digits where useful. Use the shared 32px row. The contextual row contains a 24px edit region and an 8px supplementary slider strip. Do not add hidden-slider height to the row or add component margins to the group's 4px gap. The lower slider target remains separate from the direct label/value editing targets.

The exact editable value is the equivalent pointer and keyboard control for the smaller supplementary strip. Do not apply that target exception to a standalone slider. At narrow widths, wrap a label or stack its value before text becomes unreadable. Prevent local clipping.

## Editing and acceptance

Label activation enters editing. A repeated label click ends editing once through the existing blur contract. The next click can enter editing again. Clicking inside the input retains editing. Preserve accepted values separately from previews and drafts. Validate before acceptance. Enter accepts valid input. Escape restores the accepted value in the sample.

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

On initial focus in an editable numeric field, select the complete value. Support pointer, keyboard, and label activation. A later click inside the focused field can place the caret. Keep the contextual slider hidden during text editing.
