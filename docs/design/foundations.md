# Foundations

[Working example](../../tooling/design-reference/examples/foundations/index.html) · [Design index](index.md)

These rules apply across groups. Group documents add semantic and interaction differences. [Surface-specific patterns](surfaces.md) limit generic rules for popup, timeline, canvas, and embedded UI.

## Typography and hierarchy

| Role | Family role | Size / line height | Weight |
| --- | --- | --- | --- |
| Parameter name, value, command, option | Interface | 13px / 18px | 500 |
| Caption, auxiliary metadata, secondary hint | Interface | 12px / 16px | 400 |
| Explanatory prose and errors | Interface | 14px / 20px | 400 |
| Structural group heading | Interface | 14px / 20px | 600 |

Inter is the current interface family, not a component requirement. Bundle Cyrillic, Latin, numeric coverage, and the license. Names use secondary foreground. Values use primary foreground. Selection does not increase weight. Use tabular digits for changing values. Both themes retain identical typography. Wrap long names and values. Preserve complete dimensions and readable errors. Keep prose within 45–75 characters where practical.

### Font ownership

`packages/ui/src/styles/design-tokens.css` owns family parameters. Components and portaled menus use `--sniptale-font-interface`, never literal family names. Pending surfaces retain `--sniptale-font-sans`. Migrated surfaces bind it to the interface role. Remove this distinction when remaining consumers permit it.

`packages/ui/src/styles/fonts.css` owns faces, weights, and language subsets. Its stable `Sniptale Interface` alias currently maps to Inter assets. Replace backing assets to change the bundled family. Select another family parameter only for a registered face or fallback stack. Keep family selection independent from size, line height, weight, and foreground. New files require build-asset and manifest inventory updates.

Content UI explicitly registers the stable alias. Reuse each runtime's installation owner and retain descriptors with bundled declarations. After replacement, check registered faces and painted Russian/English glyphs, narrow controls, and expanded text. Check detached layers, embedded UI, inherited status/duration, and controls. CSS declarations, asset requests, or child overrides alone do not prove font use. Load failure preserves usable fallback text and interactions.

`--sniptale-font-document-sans` independently selects authored documents' default sans-serif family. Standalone exports bind it to bundled document faces. Interface changes must not replace authored canvas text, captions, or export fonts. These belong to document/rendering owners. The excluded popup retains its font contract.

## Geometry and density

| Element | Default geometry |
| --- | --- |
| Button, input, closed dropdown, parameter row | 32px minimum height |
| Explicit larger density | 40px or 48px, same text role |
| Related inspector rows | 4px gap, without extra component margins |
| Related commands | 8px gap |
| Compact inspector groups / form groups / sections | 8px / 12px / 16px gap |
| Name above field / adjacent stacked fields | 4px internal / 8px inter-field gap |
| Typical icon | 16px, 6px gap beside text |
| Panel, preview, swatch, button, input, menu | 4px radius |
| Modal dialog | 8px radius |

Radii do not grow with viewports. Functional circles remain circles. Long labels and visible errors can increase height. Absent errors or scrollbars reserve no space. Targets need at least 24×24 CSS px unless a justified WCAG exception applies. Check spacing separately from drawing size. Use internal padding for target size. Avoid inactive gaps inside visually interactive regions.

Contextual numeric sliders stay inside their allocated rows. Showing or hiding them does not change spacing. [Numbers](numbers.md) defines their separate text and slider strips.

## Interaction hierarchy

Separate hover, keyboard focus, accepted selection, expansion, pending work, and physical pressure. Pointer interaction does not show keyboard-only frames. Real Tab navigation retains visible focus. Names, labels, hints, and interface text remain mouse-unselectable. Editable values and useful diagnostic/error text retain selection and copying.

Noneditable labels do not use text cursors. Disabled controls cannot react as available controls. Hover and press keep targets stable. Animate decoration or content inside targets. Reduced motion removes optional displacement/interpolation while retaining state and feedback.

## Surfaces and contrast

Use semantic foreground, surface, boundary, focus, and accent roles in both themes. Quiet inspector controls reveal neutral hover surfaces/boundaries. Persistent borders require a task reason. Dropdowns use light glass with opaque text and state marks. Provide solid fallbacks without blur, under reduced transparency, and in forced colors.

Check rendered backdrops: ordinary text needs 4.5:1, large text 3:1. Essential boundaries, state indicators, and focus markers need applicable 3:1 contrast. Add structural/textual state indications beyond hue. The rejected heavy slider track is not a contrast fix. Record unresolved contrast decisions.

Inspector content uses panel material. Canvas material belongs to the underlying workspace. Similar dark colors do not make these surfaces interchangeable.

## Stylesheet boundaries

Declare canonical CSS layer order before independently loaded rules. Scoped selectors register global layers. Check utility spacing and typography across lazy popup routes.

## Sources

[WCAG contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html), [non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html), [target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html), [Inter](https://rsms.me/inter/).
