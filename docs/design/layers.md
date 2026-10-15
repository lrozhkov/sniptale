# Floating layers and dialogs

[Working example](../../tooling/design-reference/examples/layers/index.html) · [Foundations](foundations.md)

[Surface-specific patterns](surfaces.md) limit generic rules for popup, timeline, canvas, and embedded UI.
## Choose the layer

Use a menu for commands, a listbox for property values, an anchored editor for a small draft, and a dialog for a protected task. Do not interrupt a task with a modal when an inline or anchored editor suffices. Keep one shared layer stack. Opening a related child preserves its parent. An unrelated transient layer replaces the current one. Decorative icons do not create separate activation targets.

## Anchoring, dismissal, and focus

Measure the actual layer. Clamp it to the visible viewport and its actual scroll owner. Avoid covering its anchor or edited object when another valid placement exists. Rebind geometry observation when a layer replaces another without closing. Reposition after scroll, resize, and anchor geometry changes. Use explicit inspector section bounds for column-width property menus.

If an anchor disappears or leaves its scroll area, close through the cancellation path and place focus logically. A modal belongs to the browser top layer. Check clipping inside its scroll owner and dialog, then stop at the modal boundary. Do not clip a modal child against the underlying page's ancestors. Escape closes the deepest unprotected layer first. Outside pointer activation closes the applicable chain without stealing destination focus.

Tab from command menus exits relative to the root trigger. Nested Right enters. Left or Escape returns to the parent. Selecting a leaf closes the command chain. Preserve side-chevron hierarchy when physical placement flips. Restore focus to a surviving trigger when dismissal still owns focus. Do not steal focus after the user moved elsewhere.

## Geometry and material

Menus share the light-glass surface, 5px shell inset, 8px row padding, and 36px minimum option row. Their hit regions remain contiguous despite 1px painted top/bottom insets. Anchored editors can use 12px content insets. Dialogs use the shared 8px radius and compact content-driven spacing. Do not reserve a large empty dialog height for short copy. Use clear title/body/action separation.

At short heights, content scrolls while actions remain reachable through their actual owner. Modal focus stays within the dialog. Destructive confirmation initially focuses Cancel.

## Drafts and color

Opening an editor creates a draft from the accepted value. Preview can update the local specimen without accepting it. Apply checks the draft and commits once. Cancel, outside dismissal, or Escape restores accepted data according to the owner contract. An inner editor can consume Escape before its parent. A second Escape must still dismiss the parent. The native eyedropper can suspend dismissal during its browser session. Cancellation retains accepted data and restores normal dismissal.

A color parameter row contains secondary name, right-aligned HEX input, and a trailing swatch. Use an elastic name, 116px HEX column, 32px swatch target, 8px gaps, and 32px minimum row height. The visible swatch is 24px with 4px corners. Long names can wrap and increase height. Errors appear below the row. Sample acceptance feedback is diagnostic, not a required product caption.

The simplified palette/HEX/alpha popup proves transactions only. Preserve the existing CompactColorSelector and CompactPaintSelector for complete color-plane and gradient behavior.

## Popup-specific curtains

Device-selection curtains belong to the extension popup. They are not a generic inspector or desktop layer pattern. Use the existing popup owner under [Surface-specific patterns](surfaces.md). Use [Properties](properties.md) for informational values and related-object navigation.

[WAI dialog](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/), [menu](https://www.w3.org/WAI/ARIA/apg/patterns/menubar/).

Textual color values select their complete contents on initial focus through pointer, Tab, or label activation. This supports direct replacement with a pasted color. A second click within the focused field can place the caret. Keep ordinary editing, IME, paste, validation, acceptance, and cancellation intact. Declare this color-value variant explicitly. Do not select all text on focus for every ordinary text field.

Use native browser `title` for optional hints throughout the application. Do not create custom tooltip layers. Keep required information in visible content and preserve complete accessible names.
