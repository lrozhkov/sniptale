# Screen compositions

[Working example](../../tooling/design-reference/examples/compositions/index.html) · [Foundations](foundations.md)

[Surface-specific patterns](surfaces.md) limit generic rules for popup, timeline, canvas, and embedded UI.
## Composition ownership

Reuse group components. A screen must not redraw checks, radio dots, chevrons, field labels, menu rows, or local press handling. A shared component owns geometry and interaction. Context selects a documented variant. The sample is a visual and interaction reference. Existing product owners retain persistence, history, imports, media engines, and permission boundaries.

## Compact parameter editor

Keep one value-column policy across related parameters. Use 32px rows and 4px gaps without extra child bottom margins. Names remain secondary. Values remain primary. Do not increase text weight when a boolean becomes true. Immediate boolean parameters use trailing switches. Deferred form parameters use trailing checkboxes. Selection lists retain leading checkboxes. Read [Selection](selection.md) before choosing the primitive.

Contextual number ranges fit inside their row and hide during direct editing. Revealing them does not move neighbors. Errors can increase height. Absent status, error, and scroll content must not reserve visible space. Long labels can wrap. Check visual spacing between visible content as well as element boxes.

Color uses name, HEX value, then trailing swatch under [Layers](layers.md). The popup probe does not replace the real color or paint selector. Optional sample explanations use the shared information disclosure. They are outside the parameter flow.

## Construction rules

Use an inline name/value row as the default for a compact inspector. Keep one trailing value-column policy across text, number, color, static property, and boolean rows. A multiline editor or full-width segment can use a name above its control. Treat this as an explicit construction choice. Do not alternate label positions arbitrarily within an otherwise equivalent parameter group.

Above-field and inline names use the same typography role. Neither becomes a caption or section heading. Use the shared parameter-name owner for every ordinary control. Feature-local spans must not inherit an accidental body weight. A control must fit its real subcolumn, not merely the outer page. Check the complete visible construction after translation. A successful isolated-control test does not establish composition acceptance.

## Navigation and dependency changes

Hiding a dependent group preserves its valid values. Do not make expansion equal enablement. Switching related panels preserves drafts and disclosure preferences according to the existing owner. Preserve logical focus when a selected object disappears, an operation fails, or a control becomes unavailable. A menu label click and a field label click must not close and immediately reopen their owned state.

Actual trigger padding, labels, and gaps use one activation policy.

## Coverage boundary

[Coverage](coverage.md) records inspected source flows, represented patterns, and preserved specialized owners. A missing ordinary state requires a rule or specimen before implementation. A specialized engine does not require sandbox reimplementation, but its preservation boundary must be explicit. Do not claim a representative specimen proves every product consumer.

## Preserve the construction

A visual alignment task preserves established control families. Preserve navigation orientation, compact icon choices, compound source controls, and their state contracts when they retain their meaning. Choose the presentation by role and existing surface context, not by the easiest component to assemble. Independent formatting states remain independent buttons. An exclusive icon property remains an icon radio group when it fits.

Do not expand these groups into text segments or dropdowns solely to apply a generic rule.

A group heading can supply the visible name of its first control when both identify the same parameter. Omit the repeated visible label, but retain the control's accessible name and group association. The consumer declares this relationship explicitly. Do not remove labels by matching strings across the DOM. Distinct nested parameters retain their own labels even when their wording overlaps.

One layout owner sets height, alignment, spacing, and group insets across value types. Child controls fit that geometry. Reset child margins and competing minimum heights. Hidden contextual tools do not add gaps. Compare mixed rows. Do not repair spacing through parameter-name selectors or individual offsets.

Measure parameter rhythm between visible label baselines. A compact one-line row uses 32px height and 4px separation. Inline swatches and utility buttons must not impose a larger minimum height. Let multiline content and errors expand explicitly. Hidden controls reserve no space.


Inline and stacked labels retain the same text inset from the row start. Moving a control below its label must not pull that label upward. Include text editors, dropdowns, segments, and compound resources in mixed-row checks.

Every parameter stack constrains its columns to the available width. Intrinsic content must wrap or truncate inside its row. It must not widen adjacent rows.
