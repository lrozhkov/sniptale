# Numeric controls

[Working example](../../tooling/design-reference/examples/numbers/index.html) · [Foundations](foundations.md)

## Choose the editor

Numeric fields provide exact values, units, bounds, and meaningful precision. Ranges support bounded continuous comparison, never arbitrary named modes. Ordinary sliders stay visible. Contextual sliders supplement inspector values on hover/range focus. Repeat steppers belong to numeric owners, not ordinary command buttons.

Preserve the product mapping, units, precision, snapping, valid boundaries, and accepted off-step values.

## Row geometry and hierarchy

Names remain secondary. Values/units remain primary, with tabular digits where useful. Only editable values receive hover paint. Numeric/color value edges stay aligned while steppers appear and editing starts. Ordinary forms retain the shared 32px control. Equivalent compact parameters use 40px rows: a 32px control band and an 8px contextual strip. Slider targets/thumbs stay clear of labels and neighboring rows. Use a 3px track. Wrapped names can increase allocation. Hover never changes height or adds margins beyond the 4px group gap. Slider targets stay separate from label/value targets.

The editable value provides equivalent pointer and keyboard control for the supplementary strip. Do not apply that target exception to a standalone slider. At narrow widths, wrap a label or stack its value before text becomes unreadable. Prevent local clipping.

## Editing and acceptance

Only the numeric input and its actual padding activate editing. Parameter names and row gaps do not focus or activate controls. Keep the accessible name through aria-labelledby. Clicking inside the input retains editing. Preserve accepted values separately from previews and drafts. Validate before acceptance. Enter accepts valid input. Escape restores the accepted value in the sample.

Invalid blur retains the invalid draft and error without changing the accepted value. Keep a valid custom off-step value unless the domain explicitly requires quantization. Do not accept an invalid intermediate string or silently replace it with a bound. Record any different product commit/blur behavior before integration.

## Contextual slider

Reveal the contextual slider during row hover, range focus, or dragging. Hide it during direct numeric editing, even while the pointer stays over the row. Restore it after editing ends only when hover or range focus requires it. Forward Tab after a valid edit can reach the sample range. Shift+Tab returns to the value.

Provide an equivalent keyboard route in the actual product owner. Use the same theme accent for ordinary and contextual fills and thumbs. Keep the retained thin neutral unfilled track. Do not restore the rejected heavy contrast track. Its final contrast decision remains open. Keep position and fill synchronized during keyboard and pointer changes.

## Hold, interruption, and recovery

Only the explicit stepper repeats. The specimen uses 220ms before repeat and 70ms between steps. Stop repetition on release, cancellation, focus loss, or a boundary. Scrubbing and range drags retain capture, preview, commit, and cancel ownership. Canceled gestures preserve the accepted value. Clear drag and pressed feedback.

Errors remain visible and copyable, associated with the field, and do not hide neighboring recovery controls.

[WAI slider](https://www.w3.org/WAI/ARIA/apg/patterns/slider/).

## Explicit domain variants

NumericField accepts separate scrubMin/scrubMax and typed min/max bounds. A valid value outside the scrub range remains accepted. Show the out-of-scale caption and omit an exact-position thumb. Focusing and leaving the range without editing must not clamp that value. A deliberate range edit selects within scrub bounds. Text arrows retain the wider typed domain.

Use editable=false for a range-only setting. Its value remains read-only while the range supports pointer and keyboard input.

Units stay visible outside editable text during focus/draft changes. Editors expand toward the leading edge, retaining the trailing unit edge. Editing starts at 5ch minimum, retaining leading inner space for longer drafts. Avoid digit-tight or oversized fixed widths. Use the same light neutral 1px boundary and input surface as inline text and HEX editors. On initial focus in an editable numeric field, select the complete value. Support pointer and keyboard activation of the input. A later click inside the focused field can place the caret.

Place the 20px stepper at the trailing edge with absolute positioning. Reveal it contextually. Do not reserve an empty trailing gutter at rest. It can extend up to 8px into a verified surrounding gutter. Keep it inside the viewport and clear of adjacent controls. Keep arrows near their value. Pointer focus retains a neutral surface. Keyboard focus uses a visible neutral strong 1px frame. Stepper hover brightens the icon without painting a filled box over the adjacent editor.

## Time intervals

Group editable Start and End values in one bounds disclosure before effect properties. Keep units visible beside numeric values. Separate the interval summary from the following property groups with one quiet horizontal rule. A selected object detail does not need a list sequence number or an expansion control that cannot collapse anything. Keep real list expansion and sequence context.
