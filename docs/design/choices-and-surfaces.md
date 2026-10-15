# Choices and dropdowns

[Working example](../../tooling/design-reference/examples/choices/index.html) · [Foundations](foundations.md)

## Segment fit

Segment labels remain on one line. Do not split words or increase control height to accommodate translation. Measure the complete labels, equal segment widths, gaps, and insets at the actual container width. Stack below the label first. Use a dropdown only if options exceed the complete group width. Preserve value, label, disabled options, and commit timing. Do not change presentation during a press, focus-owned edit, or open menu. Reevaluate after the interaction ends.

Text fitting must use the active locale and loaded font. A viewport breakpoint alone does not prove fit. Tiles, compact icon properties, and toolbar tools retain their own presentation contracts. This rule applies to ordinary segmented property choices.

## Choose the presentation

| Case | Presentation |
| --- | --- |
| Few short exclusive parameter values | Radio segments |
| Useful visual comparison | Labeled radio tiles |
| Numerous, long, or infrequent values | Dropdown |
| Large existing catalog | Searchable combobox |
| Associated content panels | [Tabs](navigation.md) |
| Exclusive drawing tool | Radio tools under [Buttons](buttons.md) |

Choose by label length, comparison needs, and available width. Search filters existing values without accepting arbitrary new values. Keep accepted values when representation changes. Do not change representation during an active gesture. Segments use a neutral selected surface without an inner frame. Light-theme selection must remain distinct from both idle and hover surfaces. Selected labels retain their normal weight.

Dropdown selection uses the shared orange vector check, separate from the neutral active-row highlight. Do not use orange option frames, underlines, generic repeated instructions, or bold selected labels.

## Width, material, and scrolling

Stacked fields keep 8px between fields and 4px between name and value. Keep the next label outside the trigger-to-menu gap. Inline inspector rows retain a 4px gap. The owner defines a stable value column. Its width does not follow the selected text or search query. A menu is at least as wide as its trigger when space permits and can expand for complete option content.

Measure labels, descriptions, icons, check column, padding, and an actual scrollbar. Clamp to the viewport and wrap long values. In a narrow inspector, an explicit section boundary defines menu width and horizontal position across name and value columns. The surface declares content-fit or full-column placement. A narrow full-column menu covers the name/value region inside that group. A content-fit menu can align to the trailing field edge. Neither mode can cover the inspector scrollbar or adjacent category rail.

Measure the content box after actual padding, borders, and scrollbar width. Do not create per-parameter width exceptions. Use 5px shell padding, 8px option padding, a 36px minimum row, and the shared 4px radius. Use light glass with the [shared fallbacks](foundations.md). Long lists scroll inside the menu. Use a narrow neutral scrollbar and a gap between highlighting and the real scrollbar.

Reserve scrollbar space only when overflow exists. Necessary check columns remain stable.

## Pointer and keyboard contract

The label, its surrounding field padding, the label/value gap, and trigger form one continuous activation region. If hovering a region highlights the field, clicking that region must activate it. A click opens or closes once. A closed menu waits for another activation before reopening. Do not forward a label activation that reopens the menu. Preserve native text editing inside searchable triggers.

Unused space outside the declared field remains inactive. Options have contiguous hit regions. Paint highlight surfaces with 1px top/bottom insets, without dead click gaps. Hover never commits a value. Clear pointer highlighting over disabled rows, menu padding, and outside the menu. The accepted check remains visible. Resume from an available keyboard option when arrow navigation returns.

Keep the active option visible and distinguish it from accepted selection.

The sample uses an active descendant and commits its active value on Tab exit. The current product select can move focus to options. Preserve its Tab and focus-loss contracts during implementation unless separately approved. Specify Enter, Space, Tab, Escape, outside-click, and blur behavior for the actual owner. Editable search retains ordinary Space entry and input-method composition.

## Values and motion

Represent mixed, empty, custom, loading, unavailable, and error states explicitly. Escape, failed loading, and empty search retain the accepted value. Do not silently select the first available option. Preserve dependent values when temporarily hidden. Keep source dimensions distinct from an explicit aspect ratio. Custom-size editing is a command outside the value list. Invalid input preserves valid dimensions.

Segment motion must not delay acceptance. Initial layout and resize do not animate selection. The chevron folds upward while open. Keep its drawing box and stroke fixed. Do not animate field geometry on hover. Respect reduced motion and dismiss through the layer owner when the anchor becomes invisible.

[WAI combobox](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/).
