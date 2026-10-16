# Choices and dropdowns

[Working example](../../tooling/design-reference/examples/choices/index.html) · [Foundations](foundations.md)

## Segment fit

Keep translated segment labels on one line without splitting words or increasing height. Prefer equal segment widths when they fit. Allow intrinsic minimum widths when unequal labels would otherwise force a dropdown. Stack below the label before changing representation. Use a dropdown only when complete intrinsic labels, individual padding, actual gaps, and insets exceed the full group width. Preserve value, label, disabled options, and commit timing. Do not change presentation during a press, focus-owned edit, or open menu. Reevaluate after the interaction ends.

Measure fit with the active locale and loaded font, not a viewport breakpoint alone. Tiles, compact icon properties, and toolbar tools retain their own presentation contracts. This rule applies to ordinary segmented property choices.

## Choose the presentation

| Case | Presentation |
| --- | --- |
| Few short exclusive parameter values | Radio segments |
| Useful visual comparison | Labeled radio tiles |
| Numerous, long, or infrequent values | Dropdown |
| Large existing catalog | Searchable combobox |
| Associated content panels | [Tabs](navigation.md) |
| Exclusive drawing tool | Radio tools under [Buttons](buttons.md) |

Choose by label length, comparison, and width. Search filters existing values without accepting arbitrary new values. Preserve accepted values across representation changes and defer changes during gestures. Segments use a neutral selected surface without an inner frame. Light-theme selection must remain distinct from both idle and hover surfaces. Selected labels retain their normal weight.

Dropdown selection uses the shared orange vector check, separate from the neutral active-row highlight. Do not use orange option frames, underlines, generic repeated instructions, or bold selected labels.

## Width, material, and scrolling

Stacked fields keep 8px between fields and 4px between name and value. Keep the next label outside the trigger-to-menu gap. Inline inspector rows retain a 4px gap. The owner defines a stable value column independent of selected text and search queries. When space permits, menus match trigger width and expand for complete options.

Measure labels, descriptions, icons, check column, padding, and an actual scrollbar. Clamp to the viewport and wrap long values. In a narrow inspector, an explicit section boundary defines menu width and horizontal position across name and value columns. The surface declares content-fit or full-column placement. A full-column menu covers the group’s name/value region. A content-fit menu can align to the trailing field edge. Neither mode can cover the inspector scrollbar or adjacent category rail.

Measure the content box after actual padding, borders, and scrollbar width. Do not create per-parameter width exceptions. Use 5px shell padding, 8px option padding, a 32px minimum row, and the shared 4px radius. Use light glass with the [shared fallbacks](foundations.md). Long lists scroll inside the menu. Use a narrow neutral scrollbar separated from highlighting.

Reserve scrollbar space only when overflow exists. Necessary check columns remain stable.

## Pointer and keyboard contract

Only the actual dropdown trigger and its complete padding activate the menu. Parameter names and label/value gaps remain inactive. Retain accessible names through aria-labelledby without native label forwarding. A click opens or closes once. Preserve visible keyboard focus and native text editing inside searchable triggers.

Unused space outside the declared field remains inactive. Options use 32px minimum rows and true 2px gaps. Descriptions and wrapped content increase row height naturally. Do not force rich options into 32px. Keep neighboring selected and hovered surfaces visibly separate. Gaps do not activate options. Hover never commits a value. Clear pointer highlighting over disabled rows, menu padding, and outside the menu. The accepted check remains visible. Resume from an available keyboard option when arrow navigation returns.

Keep the active option visible and distinguish it from accepted selection.

The sample uses an active descendant and commits its active value on Tab exit. The current product select can move focus to options. Preserve its Tab and focus-loss contracts during implementation unless separately approved. Specify Enter, Space, Tab, Escape, outside-click, and blur behavior for the actual owner. Editable search retains ordinary Space entry and input-method composition.

## Values and motion

Represent mixed, empty, custom, loading, unavailable, and error states explicitly. Escape, failed loading, and empty search retain the accepted value. Do not silently select the first available option. Preserve dependent values when temporarily hidden. Keep source dimensions distinct from an explicit aspect ratio. Custom-size editing is a command outside the value list. Invalid input preserves valid dimensions.

Segment motion must not delay acceptance. Initial layout and resize do not animate selection. The chevron folds upward while open. Keep its drawing box and stroke fixed. Do not animate field geometry on hover. Respect reduced motion and dismiss through the layer owner when the anchor becomes invisible.

[WAI combobox](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/).

In the explicit compact inspector, segments use 32px height and 6px horizontal padding per option. Stack segments below their name before fallback. Use a dropdown only when complete labels and actual insets exceed the full available width. General controls retain their existing height.
