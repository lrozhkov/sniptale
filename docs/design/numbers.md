# Numeric controls

[Working example](../../tooling/design-reference/examples/numbers/index.html) · [Foundations](foundations.md)

## Choose the editor

[Numeric fields](../../tooling/design-reference/examples/layers/index.html) specify values, units, bounds, and precision. Keep ordinary sliders visible.

- Use a scale with a pencil for visual or audible effects such as opacity, blur, shadow strength, and volume. Use the same limits for the scale and exact entry.
- Use a contextual slider when its useful limits differ from exact entry. Keep both limits.
- Use a stepper for frequent single steps in dimensions, corner radius, and trim times.
- Use direct entry when a step has little meaning, as with a random seed.

Preserve the product mapping, units, precision, snapping, valid boundaries, and accepted off-step values.

Focused, hovered numeric inputs consume vertical wheel events they handle through existing owners. In Layers, the active value frame also accepts Alt or Option with the wheel. Support Up and Down. Unmodified wheel scrolls.

## Row geometry and hierarchy

Use secondary names, primary values and units, and tabular digits where useful. Paint hover only on editable values. Align numeric and color value edges during editing and when steppers appear. Use 32px controls in ordinary forms. Compact parameters use 40px rows with a 32px control band and an 8px contextual strip. Use a 3px track. Keep slider targets and thumbs clear of labels, values, and neighboring rows. Wrapped names can increase height. Hover retains height and the 4px group gap.

The editable value provides equivalent pointer and keyboard control for the supplementary strip. Do not apply that target exception to a standalone slider. At narrow widths, wrap a label or stack its value before text becomes unreadable. Prevent local clipping.

## Editing and acceptance

Only the numeric input and its padding activate editing. Names and gaps stay inactive. Use aria-labelledby for the accessible name. Clicks inside the input retain editing. Store accepted values, previews, and drafts separately. Validate before acceptance. Enter accepts valid input. Escape restores the accepted value in the sample.

On invalid blur, retain the draft, error, and accepted value. Keep valid off-step values unless the domain requires quantization. Reject invalid drafts without silently clamping them. Record different product commit or blur behavior before integration.

## Contextual slider

Show the contextual slider on row hover, range focus, or drag. Hide it during numeric editing. After editing, show it only on hover or range focus. In the sample, Tab can reach the range after a valid edit. Shift+Tab returns to the value.

Support equivalent keyboard input in the product. Use the same theme accent for ordinary and contextual fills and thumbs. Keep the retained thin neutral unfilled track. Do not restore the rejected heavy contrast track. Its final contrast decision remains open. Keep position and fill synchronized during keyboard and pointer changes.

## Hold, interruption, and recovery

Only the explicit stepper repeats. The sample waits 220ms and repeats every 70ms. Stop on release, cancellation, focus loss, or a boundary. Scrubbing and range drags retain capture, preview, commit, and cancel ownership. On cancellation, preserve the accepted value and clear drag and press feedback.

Keep errors visible, copyable, and associated with their fields. Keep recovery controls visible.

[WAI slider](https://www.w3.org/WAI/ARIA/apg/patterns/slider/).

## Explicit domain variants

NumericField accepts separate scrubMin/scrubMax and typed min/max bounds. A valid value outside the scrub range remains accepted. Show the out-of-scale caption and omit an exact-position thumb. Focusing and leaving the range without editing must not clamp that value. A deliberate range edit selects within scrub bounds. Text arrows retain the wider typed domain.

Set `editable=false` for range-only settings. Keep the value read-only. Support pointer and keyboard input.

Keep units visible outside the input during focus and draft changes. Expand toward the leading edge. Keep the trailing unit edge fixed. Start at 5ch and retain leading space for longer drafts. Avoid tight or oversized fixed widths. Use the neutral 1px border and surface from text and HEX editors. Support pointer and keyboard activation. Select all on initial focus. A later click can place the caret.

Place the 20px stepper at the trailing edge with absolute positioning. Reveal it contextually. Do not reserve an empty trailing gutter at rest. It can extend up to 8px into a verified surrounding gutter. Keep it inside the viewport and clear of adjacent controls. Keep arrows near their value. Pointer focus retains a neutral surface. Keyboard focus uses a visible neutral strong 1px frame. Stepper hover brightens the icon without painting a filled box over the adjacent editor.

## Time intervals

Group editable Start and End values in one bounds disclosure before effect properties. Keep units visible beside numeric values. Separate the interval summary from the following property groups with one quiet horizontal rule. A selected object detail does not need a list sequence number or an expansion control that cannot collapse anything. Keep real list expansion and sequence context.
