# Screen compositions

[Working example](../../tooling/design-reference/examples/compositions/index.html) · [Foundations](foundations.md)

[Surface-specific patterns](surfaces.md) limit generic rules for popup, timeline, canvas, and embedded UI.
## Composition ownership

Reuse group components. A screen must not redraw checks, radio dots, chevrons, field labels, menu rows, or local press handling. A shared component owns geometry and interaction. Context selects a documented variant. The sample is a visual and interaction reference. Existing product owners retain persistence, history, imports, media engines, and permission boundaries.

## Compact parameter editor

Keep one value-column policy across related parameters. The explicit compact inspector uses 40px rows and 4px gaps without extra child margins. Each inline row contains a 32px control band and an 8px contextual strip. A stacked name/control construction uses a 32px name band, 4px gap, and 32px control. Omit its dormant lower strip, giving 68px before wrapped content or errors. General forms and buttons retain 32px defaults. Names remain secondary. Values remain primary. Do not increase text weight when a boolean becomes true. Immediate boolean parameters use trailing switches. Deferred form parameters use trailing checkboxes. Selection lists retain leading checkboxes. Read [Selection](selection.md) before choosing the primitive.

Contextual number ranges fit inside their row and hide during direct editing. Revealing them does not move neighbors. Errors can increase height. Absent status, error, and scroll content must not reserve visible space. Long labels can wrap. Check visual spacing between visible content as well as element boxes.

Color uses name, HEX value, then trailing swatch under [Layers](layers.md). The popup probe does not replace the real color or paint selector. Optional sample explanations use the shared information disclosure. They are outside the parameter flow.

## Construction rules

Use an inline name/value row as the default for a compact inspector. Keep one trailing value-column policy across text, number, color, static property, and boolean rows. A multiline editor or full-width segment can use a name above its control. Treat this as an explicit construction choice. Do not alternate label positions arbitrarily within an otherwise equivalent parameter group.

Above-field and inline names use the same typography role. Neither becomes a caption or section heading. Use the shared parameter-name owner for every ordinary control. Feature-local spans must not inherit an accidental body weight. A control must fit its real subcolumn, not merely the outer page. Check the complete visible construction after translation. A successful isolated-control test does not establish composition acceptance.

## Navigation and dependency changes

Hiding a dependent group preserves its valid values. Do not make expansion equal enablement. Switching related panels preserves drafts and disclosure preferences according to the existing owner. Preserve logical focus when a selected object disappears, an operation fails, or a control becomes unavailable. Parameter names do not activate text, numeric, color, paint, or dropdown editors. Actual controls retain their complete clickable padding. Boolean named toggles retain their action.

Actual trigger padding belongs to the control. Parameter names and row gaps remain outside its activation region.

## Coverage boundary

[Coverage](coverage.md) records inspected source flows, represented patterns, and preserved specialized owners. A missing ordinary state requires a rule or specimen before implementation. A specialized engine does not require sandbox reimplementation, but its preservation boundary must be explicit. Do not claim a representative specimen proves every product consumer.

## Preserve the construction

A visual alignment task preserves established control families. Preserve navigation orientation, compact icon choices, compound source controls, and their state contracts when they retain their meaning. Choose the presentation by role and existing surface context, not by the easiest component to assemble. Independent formatting states remain independent buttons. An exclusive icon property remains an icon radio group when it fits.

Do not expand these groups into text segments or dropdowns solely to apply a generic rule.

A group heading can supply the visible name of its first control when both identify the same parameter. Omit the repeated visible label, but retain the control's accessible name and group association. The consumer declares this relationship explicitly. Do not remove labels by matching strings across the DOM. Distinct nested parameters retain their own labels even when their wording overlaps.

One layout owner sets height, alignment, spacing, and group insets across value types. Child controls fit that geometry. Component boundaries do not create semantic groups. Related fields share one group inset, without stacked section padding between their rows. Reset child margins and competing minimum heights. Hidden contextual tools do not add gaps. Compare mixed rows. Do not repair spacing through parameter-name selectors or individual offsets.

Measure parameter rhythm between visible label baselines. Equivalent compact rows use 40px height and 4px separation. Their first control bands share a baseline, with 44px between adjacent one-line baselines. Inline swatches and utility buttons must not impose a larger minimum height. Let multiline content and errors expand explicitly. Hidden controls reserve no space.


Inline and stacked labels retain the same text inset from the row start. Moving a control below its label must not pull that label upward. Include text editors, dropdowns, segments, and compound resources in mixed-row checks.

Every parameter stack constrains its columns to the available width. Intrinsic content must wrap or truncate inside its row. It must not widen adjacent rows.

Reserve at least 140px for the compact color value construction. Keep HEX and the trailing 32px swatch target inline when they fit. The visible swatch is 16px. Numeric values reach the same trailing content edge without an empty stepper gutter. Check the actual 320px inspector, including its padding and scrollbar. Stacked content and wrapped names can increase row height.

Form editors keep at least 4px between visible field bounds and adjacent command hover paint. Align footer targets to the actual field inset. Cancel uses the quiet family. Save uses the task's primary family. Check new, editing, empty, and canceled states.

Compound action rows preserve complete commands and canonical parameter insets. Let commands wrap by their intrinsic content when they cannot fit. Exact controls and their preset owner share the same label and value alignment. Preserve specialized numeric stepper overhang inside its verified gutter.

Prove the composed variants, not only isolated controls. Include empty and populated resources, attached actions, expanded exact settings, and long translated labels. Component unit tests do not prove rendered alignment or overflow. Measure visible control bounds in the actual consumer at the required viewports.
