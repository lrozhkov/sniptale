# Floating layers and dialogs

[Working example](../../tooling/design-reference/examples/layers/index.html) · [Foundations](foundations.md)

[Surface-specific patterns](surfaces.md) limit generic rules for popup, timeline, canvas, and embedded UI.
## Choose the layer

Use menus for commands, listboxes for values, anchored editors for small drafts, and dialogs for protected tasks. Prefer sufficient inline/anchored editors over modals. One shared stack preserves parents for related children and replaces unrelated transient layers. Decorative icons have no separate targets.

## Anchoring, dismissal, and focus

Measure layers and clamp them to the viewport and actual scroll owner. Prefer valid placements clear of anchors/edited objects. Rebind geometry observation for replacements without closing. Reposition after scroll, resize, or anchor changes. Column-width property menus use explicit inspector section bounds.

If an anchor disappears or leaves its scroll area, close through the cancellation path and place focus logically. A modal belongs to the browser top layer. Check clipping inside its scroll owner and dialog, then stop at the modal boundary. Do not clip a modal child against the underlying page's ancestors. Escape closes the deepest unprotected layer first. Outside pointer activation closes the applicable chain without stealing destination focus.

Tab from command menus exits relative to the root trigger. Nested Right enters. Left or Escape returns to the parent. Selecting a leaf closes the command chain. Preserve side-chevron hierarchy when physical placement flips. Restore focus to a surviving trigger when dismissal still owns focus. Do not steal focus after the user moved elsewhere.

## Geometry and material

Menus share the light-glass surface, 5px shell inset, 8px row padding, and 32px minimum option row. Leave true 2px gaps between options. Content-toolbar menus use a compact variant: 32px minimum rows, 6px vertical and 8px horizontal padding, 2px row separation, and the same 5px shell inset. Multiline copy increases row height. Anchored editors can use 12px content insets. Dialogs use the shared 8px radius and compact content-driven spacing. Do not reserve a large empty dialog height for short copy. Use clear title/body/action separation. Separate short form sections with spacing. Do not add decorative rules between the title, fields and footer. Do not wrap each field in a second card.

Dialog headers and bodies use 16px horizontal and 12px vertical insets. Footers use 16px horizontal and 8px vertical insets, with 8px between commands. Titles use the structural heading role. Messages use the appropriate text role. These defaults do not replace specialized recording strips or edge drawers.

Compact popover headers use Interface 12px / 16px, weight 500, and secondary foreground. Use normal case and normal letter spacing. Do not apply the structural dialog heading role. Omit a header that repeats the trigger or first parameter name.

At short heights, content scrolls while actions remain reachable through their actual owner. Modal focus stays within the dialog. A dialog container can receive programmatic focus without a frame around the whole surface. Keep visible keyboard focus on its interactive controls. Destructive confirmation initially focuses Cancel.

## Drafts and color

Opening an editor creates a draft from the accepted value. Preview can update the local specimen without accepting it. Apply checks the draft and commits once. Cancel, outside dismissal, or Escape restores accepted data according to the owner contract. An inner editor can consume Escape before its parent. A second Escape must still dismiss the parent. The native eyedropper can suspend dismissal during its browser session. Cancellation retains accepted data and restores normal dismissal.

Use [color row geometry](parameter-layout.md#color-row-geometry) for inline HEX and swatch construction.

## Color and gradient editors

Use the [picker rules](color-and-gradient-editors.md) and the complete examples in the layers sandbox.

## Popup-specific curtains

Device-selection curtains belong to the extension popup. They are not a generic inspector or desktop layer pattern. Use the existing popup owner under [Surface-specific patterns](surfaces.md). Use [Properties](properties.md) for informational values and related-object navigation.

[WAI dialog](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/), [menu](https://www.w3.org/WAI/ARIA/apg/patterns/menubar/).

Textual colors select all contents on initial pointer/Tab focus for paste replacement. Subsequent clicks can place the caret. Preserve ordinary editing, IME, paste, validation, acceptance, and cancellation. Declare this variant explicitly without extending it to ordinary text fields.

Follow [full-text access](localization.md#full-text-access) for hints. Use native browser hints, not custom UI layers. Omit hints that repeat fully visible text. The popup uses conditional `title` attributes without changing control dimensions or text wrapping. Keep required information visible and preserve complete accessible names.

Keep text and swatch alignment stable during hover and editing. Hovering the parameter name does not highlight its color field. Preserve color-plane geometry and transactional picker behavior.

Autocomplete suggestions are floating layers. They must remain outside a clipping field or inspector scrollport. Use the existing portal, theme, placement, and interaction owners. Keep text focus in the combobox. Keep its active option visible inside the menu scrollport. Escape closes suggestions before the surrounding editor. Preserve draft text and explicit-submit behavior. Adjacent active and hovered options retain the common menu gap.
