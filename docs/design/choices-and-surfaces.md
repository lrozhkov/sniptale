# Choices and dropdowns

[Working example](../../tooling/design-reference/examples/choices/index.html) · [Foundations](foundations.md)

## Segment fit

Follow [layout adaptation](responsive.md#compaction-order) for segment fit and deferred representation changes.

## Choose the presentation

| Case | Presentation |
| --- | --- |
| Few short exclusive parameter values | Radio segments |
| Useful visual comparison | Labeled radio tiles |
| Numerous, long, or infrequent values | Dropdown |
| Large existing catalog | Searchable combobox |
| Associated content panels | [Tabs](navigation.md) |
| Exclusive drawing tool | Radio tools under [Buttons](buttons.md) |

Choose by label length, comparison, and width. Search only filters existing values. Preserve values across presentations. Defer changes during gestures. Keep the segment group transparent. Use the stepper surface token and a neutral border on the selected segment. Use the field hover token on available idle segments. Keep label weight and segment size constant. Show keyboard focus independently of selection.

Mark dropdown selection with a vector check. Use orange in the product and neutral ink in the sandbox. Keep the active row neutral. Omit option frames, underlines, repeated instructions, and bold selection labels.

## Width, material, and scrolling

Use a stable value column. Allow 8px between stacked fields and 4px between labels and values or inspector rows. Keep the next label clear of the menu gap. Match trigger width where possible. Expand for complete options.

Sandbox triggers have a light gray surface and border. Hover darkens the surface and border. An open trigger keeps the hover surface and shows one focus border. Keep geometry constant.

Measure labels, descriptions, icons, checks, padding, and any visible scrollbar. Clamp to the viewport and wrap long values. In a narrow inspector, section bounds define the menu width and horizontal position. The surface declares content-fit or full-column placement. A full-column menu covers the group’s name/value region. A content-fit menu can align to the trailing field edge. Neither mode can cover the inspector scrollbar or adjacent category rail.

Measure the content box after actual padding, borders, and scrollbar width. Do not create per-parameter width exceptions. Use 5px shell padding, 8px option padding, a 32px minimum row, and the shared 4px radius. Use light glass with the [shared fallbacks](foundations.md). Long lists scroll inside the menu. Use a narrow neutral scrollbar separated from highlighting.

Reserve scrollbar space only for overflow. Keep check columns stable.

Searchable catalogs keep the search field visible while their results scroll. Bound the surface to the viewport and its clipping ancestors. Long user-defined names must not expand the host layout. Follow [full-text access](localization.md#full-text-access) for truncated names. Keep text behind the surface from showing through its input and option labels.

## Pointer and keyboard contract

Only the actual dropdown trigger and its complete padding activate the menu. Parameter names and label/value gaps remain inactive. Retain accessible names through aria-labelledby without native label forwarding. A click opens or closes once. Preserve visible keyboard focus and native text editing inside searchable triggers.

Unused space outside the declared field remains inactive. Options use 32px minimum rows and true 2px gaps. Descriptions and wrapped content increase row height naturally. Do not force rich options into 32px. Keep neighboring selected and hovered surfaces visibly separate. Gaps do not activate options. Hover never commits a value. Clear pointer highlighting over disabled rows, menu padding, and outside the menu. The accepted check remains visible. Resume from an available keyboard option when arrow navigation returns.

Keep the active option visible and distinguish it from accepted selection.

The sample uses an active descendant and commits its active value on Tab exit. The current product select can move focus to options. Preserve its Tab and focus-loss contracts during implementation unless separately approved. Specify Enter, Space, Tab, Escape, outside-click, and blur behavior for the actual owner. Editable search retains ordinary Space entry and input-method composition.

## Values and motion

Represent mixed, empty, custom, loading, unavailable, and error states explicitly. Escape, failed loading, and empty search retain the accepted value. Do not silently select the first available option. Preserve dependent values when temporarily hidden. Keep source dimensions distinct from an explicit aspect ratio. Custom-size editing is a command outside the value list. Invalid input preserves valid dimensions.

Paint selection as soon as the value changes. Animate only the idle segment hover color. The chevron folds upward while open. Keep its drawing box and stroke fixed. Respect reduced motion. Dismiss through the layer owner when the anchor becomes invisible.

[WAI combobox](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/).

Compact inspector segments use 32px height and 6px horizontal padding per option. Inset the selected and hover surfaces by 3px vertically and 2px horizontally. Keep the button targets and row spacing at their specified sizes.

Configured provider/model pickers refresh catalogs when opened. Keep the menu open and preserve search and choice during reads. Failed reads retain the last catalog and expose retry. Refresh never selects a different provider or model. Keep removed choices unresolved until replacement. Existing owners retain initial configured defaults.
