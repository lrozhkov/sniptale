# Command text and icons

[Buttons](buttons.md) · [Working examples](../../tooling/design-reference/examples/buttons/index.html)

## Decision table

Choose content from the action family and context. Do not use icon presence to indicate priority, danger, or disabled state.

| Family and context | Default content | Reason |
| --- | --- | --- |
| Form Save, Apply, Cancel, Confirm, Retry | Text only | The explicit command is already clear |
| Add/create within an object collection | Plus and text | The shared acquisition family remains recognizable across collections |
| Open/import from a file or computer | Established folder/import icon and text | Identifies the acquisition source |
| Descriptive one-off task command | Text only | Do not invent a symbol without a recognition benefit |
| Undo, Redo, Close, field Clear | Established icon only | Stable local chrome meaning in a compact location |
| Dense object-row delete or duplicate | Existing family icon only, with accessible name and hint | The row identifies the object and the shared symbol identifies the action |
| Destructive task or confirmation | Explicit text naming action and object | A trash icon alone does not explain irreversible work |
| Toolbar tool or mode | Established tool icon, optionally text in the labeled presentation | Tool recognition and repeated spatial scanning |
| Add menu or generic More menu | Plus or overflow icon, with text when the context needs it | The symbol already communicates the established menu family |

A task region can use an existing shared icon-and-text family for repeated commands such as export. That choice applies to equivalent commands across the same surface. Record it once in the shared family, not in each consumer. When no established family or recognition benefit exists, use text only. Do not add an icon merely to balance a neighboring control or make a primary action look stronger.

## Keep dimensions independent

After choosing content, select quiet, neutral filled, or imagery-backed presentation under [Buttons](buttons.md). An icon does not require a fill or border. A fill does not require an icon. Danger tone, enabled state, menu expansion, and physical pressure remain separate dimensions. Icons beside text use the shared 16px drawing box and 6px gap.

Equivalent action families use the same icon, stroke, drawing box, and label policy. Private feature replacements require a named semantic reason rather than personal preference.

## Responsive reduction

An approved icon-and-text command can become icon-only when its owning surface has that established compact presentation. Retain the complete accessible name and native browser hint. Hide only visible text, not the semantic label. Keep the hit target and command meaning stable. Do not switch representation during an active press or menu interaction. Do not invent icons for text-only commands to avoid wrapping.

Wrap, move the whole command to a supported overflow menu, or preserve the surface's minimum width instead. Use the source-backed [responsive contract](responsive.md) before selecting a breakpoint.

Popup and specialized toolbars retain their local action families under [Surface-specific patterns](surfaces.md). Do not apply desktop command content mechanically to a timeline or recording popup.

## Existing compact compound controls

A pair of source icons can represent acquisition and source state within one resource field. Preserve its source indicators, pending feedback, and repeated-click meaning, including acquisition and clearing. File cancellation and failed acquisition preserve accepted data. Do not replace the pair with unrelated text commands or an extra removal button. This is a semantic family, not an exception tied to a field's name.

A binary property with immediate application uses a switch. Two words for enabled/disabled do not justify an enum dropdown.
