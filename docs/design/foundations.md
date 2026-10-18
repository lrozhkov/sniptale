# Foundations

[Working example](../../tooling/design-reference/examples/foundations/index.html) · [Design index](index.md)

Shared rules apply across groups. Group documents define semantic/interaction differences. [Surface-specific patterns](surfaces.md) limit generic rules for popup, timeline, canvas, and embedded UI.

## Typography and hierarchy

| Role | Family role | Size / line height | Weight |
| --- | --- | --- | --- |
| Parameter name, value, command, option | Interface | 13px / 18px | 400 |
| Caption, auxiliary metadata, secondary hint | Interface | 12px / 16px | 400 |
| Explanatory prose and errors | Interface | 14px / 20px | 400 |
| Structural group heading | Interface | 14px / 20px | 500 |

[Golos UI](https://www.paratype.ru/catalog/font/pt/golos-ui) is the current interface family, not a component requirement. Use Golos Text for user-authored text and text entry. Use Golos UI for labels, buttons, and menus. Bundle Cyrillic, Latin, numeric coverage, and the license. Names use secondary foreground. Values use primary foreground. Ordinary value selection does not increase weight. Labeled panel tools use the explicit 400/450/500 interaction variant in [Buttons](buttons.md). Use tabular digits for changing values. Wrap long names and values. Preserve complete dimensions and readable errors. Keep prose within 45–75 characters where practical.

Calibrate roles per family. Numeric weights do not guarantee equal visual density. Ordinary controls use regular weight. Group headings use medium weight and secondary or inherited foreground. Themes share weights/metrics and use semantic foregrounds. Avoid pure black or white as default emphasis. Do not combine heavier weight, maximum contrast, and increased size for ordinary controls.

Normal text retains at least 4.5:1 contrast. Thin rasterized strokes can reduce apparent contrast. Check rendered Russian/English text. The minimum does not define a maximum. [Fluent typography](https://fluent2.microsoft.design/typography) demonstrates regular body roles and separate emphasis roles. [Material typography](https://m3.material.io/styles/typography/applying-type) provides another role reference.

### Font ownership

[Font families and installation](fonts.md) owns family parameters, bundled faces, runtime registration, replacement proof, and document/export compatibility.

## Geometry and density

| Element | Default geometry |
| --- | --- |
| Ordinary button, input, closed dropdown, parameter row | 32px minimum height |
| Explicit compact inspector, inline | 32px control band + 8px contextual strip = 40px row |
| Explicit compact inspector, stacked | 32px name + 4px gap + 32px control = 68px row |
| Explicit larger density | 40px or 48px, same text role |
| Related inspector rows | 4px gap, without extra component margins |
| Related commands | 8px gap |
| Compact inspector groups / form groups / sections | 8px / 12px / 16px gap |
| Name above field / adjacent stacked fields | 4px internal / 8px inter-field gap |
| Typical icon | 16px, 6px gap beside text |
| Panel, preview, swatch, button, input, menu | 4px radius |
| Modal dialog | 8px radius |

Radii stay fixed across viewports. Functional circles stay circular. Long labels/errors can increase height. Absent errors or scrollbars reserve no space. Targets need at least 24×24 CSS px unless a justified WCAG exception applies. Check spacing separately from drawing size. Size targets through internal padding. Avoid inactive gaps inside visually interactive regions.

Contextual numeric sliders stay inside their allocated rows. Showing or hiding them does not change spacing. [Numbers](numbers.md) defines their separate text and slider strips.

## Interaction hierarchy

Separate hover, keyboard focus, accepted selection, expansion, pending work, and physical pressure. Pointer interaction does not show keyboard-only frames. Real Tab navigation retains visible focus. Names, labels, hints, and interface text remain mouse-unselectable. Editable values and useful diagnostic/error text retain selection and copying.

Noneditable labels avoid text cursors. Disabled controls cannot appear available. Hover and press keep targets stable. Animate decoration or content inside targets. Reduced motion removes optional displacement/interpolation while retaining state and feedback.

## Surfaces and contrast

Use semantic foreground, surface, boundary, focus, and accent roles in both themes. Quiet inspector controls reveal neutral hover surfaces/boundaries. Persistent borders require a task reason. Dropdowns use light glass with opaque text and state marks. Provide solid fallbacks without blur, under reduced transparency, and in forced colors.

Fill/boundary accents do not guarantee readable small text. Use a text foreground role for labels that need a different shade, including selected and hovered states.

Check rendered backdrops: ordinary text needs 4.5:1, large text 3:1. Essential boundaries, state indicators, and focus markers need applicable 3:1 contrast. Add structural/textual state indications beyond hue. The rejected heavy slider track is not a contrast fix. Record unresolved contrast decisions.

Inspector content uses panel material. Canvas material belongs to the underlying workspace. Similar dark colors do not make these surfaces interchangeable.

## Stylesheet boundaries

Declare canonical CSS layer order before independently loaded rules. Scoped selectors register global layers. Check utility spacing and typography across lazy popup routes.

## Sources

[WCAG contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html), [non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html), [target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html), [Golos UI](https://www.paratype.ru/catalog/font/pt/golos-ui).
