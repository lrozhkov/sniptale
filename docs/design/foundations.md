# Foundations

[Working example](../../tooling/design-reference/examples/foundations/index.html) · [Design index](index.md) These shared rules apply to all groups. Group documents define only semantic and interaction differences. [Surface-specific patterns](surfaces.md) limit generic rules for popup, timeline, canvas, and embedded UI.

## Typography and hierarchy

| Role | Family role | Size / line height | Weight |
| --- | --- | --- | --- |
| Parameter name, value, command, option | Interface | 13px / 18px | 500 |
| Caption, auxiliary metadata, secondary hint | Interface | 12px / 16px | 400 |
| Explanatory prose and errors | Interface | 14px / 20px | 400 |
| Structural group heading | Interface | 14px / 20px | 600 |

Inter is the current interface family, not a component requirement. Use the bundled interface font with Cyrillic, Latin, and numeric coverage. Keep its license with the asset. Names use secondary foreground. Values use primary foreground. Selection does not increase font weight. Use tabular digits where values change in place. Do not change typography between light and dark themes. Long names and values can wrap. Preserve complete dimensions and readable errors rather than hiding overflow.

Keep prose within 45–75 characters where practical. Control labels can use the compact roles above.

### Font ownership

`packages/ui/src/styles/design-tokens.css` owns family selection through CSS parameters. `--sniptale-font-interface` selects the migrated interface family, including portaled menus. Components use this role, not a literal family name. The existing `--sniptale-font-sans` retains the current family for pending surfaces. A migrated surface binds that existing parameter to the interface role. Remove this rollout distinction when the remaining consumers permit it.

`packages/ui/src/styles/fonts.css` owns bundled face declarations, weights, and language subsets. The stable `Sniptale Interface` face alias currently maps to Inter assets. To replace this bundled family, update its face assets. Change the family parameter only when selecting another registered family or fallback stack. Keep size, line height, weight, and foreground roles separate from family selection. Recheck actual text fit after replacement, including Russian, English, narrow controls, and expanded text.

Content UI registers the stable interface alias explicitly. Replace its backing declarations to use another bundled face. Do not select an unregistered alias through the family parameter. New bundled files also require build asset and manifest inventory updates.

`--sniptale-font-document-sans` selects the default family for authored sans-serif documents. Keep this role independent from the interface family. Standalone exported documents bind it to their bundled document faces.

Check the loaded font in the runtime that shows the changed surface, including detached layers and embedded UI. A CSS family declaration or a successful asset request does not prove that the browser uses the face. Check registered faces and painted glyphs for Russian and English. Keep face descriptors with the bundled declarations. Reuse the runtime's font installation owner when the surface requires explicit registration. A load failure must preserve usable fallback text and existing interactions.

Do not replace fonts inside authored canvas text, captions, or exports through an interface token change. These values belong to the document or renderer. The excluded popup retains its current font contract.

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

Radii do not grow with the viewport. Functional circles remain circles. Long labels and visible errors can increase row height. Do not reserve space for absent errors or scrollbars. Provide targets of at least 24×24 CSS px unless a justified WCAG exception applies. Check target spacing separately from drawing size. Use internal padding for target size. Do not create inactive gaps inside a visually interactive region.

The contextual numeric slider fits inside its row. It does not add spacing when hidden or revealed.

## Interaction hierarchy

Treat hover, keyboard focus, accepted selection, expanded state, pending work, and physical pressure as separate states. Pointer interaction must not show a keyboard-only focus frame. Real Tab navigation retains a visible focus indicator. Keep names, labels, hints, and interface text unselectable with the mouse. Editable values and useful diagnostic/error text retain text selection and copying.

Do not use a text cursor on noneditable labels. Disabled controls do not react as available controls. Keep visible targets stable during hover and press. Animate decoration or content inside the target. Reduced motion removes optional displacement and interpolation without hiding state or feedback.

## Surfaces and contrast

Use semantic foreground, surface, boundary, focus, and accent roles for both themes. Quiet inspector controls reveal neutral surfaces and boundaries on hover. Do not add persistent borders without a task reason. Dropdowns use light glass. Apply transparency to the surface only, with opaque text and state marks. Provide a solid fallback without blur, under reduced transparency, and in forced colors.

Check text against the rendered backdrop: ordinary text needs 4.5:1, large text 3:1. Essential control boundaries, state indicators, and focus markers need the applicable 3:1 contrast. Do not rely on hue alone. Keep a visible structural or textual state indication. The rejected heavy slider track is not a contrast fix. Record unresolved contrast decisions explicitly.

## Sources

[WCAG contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html), [non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html), [target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html), [Inter](https://rsms.me/inter/).

Inspector content uses the panel surface. The canvas surface belongs to the underlying workspace. Do not substitute canvas material for a panel because both are dark.
