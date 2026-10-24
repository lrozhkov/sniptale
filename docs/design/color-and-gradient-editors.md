# Color and gradient editors

[Layers](layers.md) owns placement, dismissal, focus, and transaction rules.

The layers sandbox demonstrates the actual `CompactColorSelector` and `CompactPaintSelector` components. Color editing uses one shared panel in both components. Complete and compact modes share one remembered preference. A controlled density override supports catalog examples. Compact color mode contains the palette, color plane, hue, opacity, eyedropper, and footer. Hide recent colors when empty or compact.

Hue and opacity use hollow circular markers on stacked tracks with 3px corners. The opacity track uses the selected color. Checkerboard backgrounds reveal transparency. Hide the cursor during pointer manipulation of the color plane or gradient geometry. Restore it after release, cancellation, capture loss, blur, Escape, or unmount. Geometry handles also support arrow keys and larger steps with Shift.

Use neutral controls and visible keyboard focus. Keep channel letters and units inside numeric fields. Do not repeat the active HEX, RGB, or HSL label below its switch. Number steppers accelerate during a held press. Invalid text remains editable and prevents Apply. Copy feedback uses a busy state without a forbidden cursor. Selecting the original color restores it without closing the editor.

Combined editors first select Color, Gradient, or Templates. Select the gradient type inside Gradient. Keep geometry and advanced parameters compact and aligned. Templates use a bounded internal scroll area with list and grid views. Grid tiles omit visible names and retain accessible names and native hints. Saving a template is independent of accepting the current fill. Rename and delete affect user templates through the existing catalog authority.

Gradient edits use a local Undo history. A drag or held stepper is one history action. Text fields retain native text Undo. Apply creates one accepted result in the consumer. Each consumer must retain every parameter that its editor exposes. Frame backgrounds retain canonical linear gradients alongside legacy fields. Advanced frame gradients use the existing bounded background raster path for rendering and export. Simple gradients retain their native rendering.
