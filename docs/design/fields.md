# Fields and forms

[Working example](../../tooling/design-reference/examples/fields/index.html) · [Foundations](foundations.md)

## Structure

Use persistent secondary labels and primary editable values. A placeholder is an example, not a label. Use a single-line field for short text, multiline input for prose, and a search field for filtering. Inspector fields remain quiet at rest. Form fields can retain the neutral surface and boundary required by the form context. Keep 32px default height, 4px label gap, and the shared typography. Let multiline content use its own scroll/resize owner.

Read-only values remain selectable and copyable. Disabled values retain their actual content. Mixed values are explicit and are not a literal accepted string such as “Different values.”

## Continuous interaction

The input owns its hover paint. Hovering the label or intervening gap does not highlight the row or value. Preserve label activation and text editing inside the input. The label uses an activation cursor rather than a text-selection cursor. A repeated label click ends editing once. Do not let native label forwarding immediately return to editing. A later label click re-enters editing. Clicking within the input does not end editing.

Pointer focus does not draw the keyboard-only frame. Tab retains visible focus.

## Clear action

Editable nonempty text fields have a trailing 24px clear target inside the field. Use the shared cross icon. Give clear an accessible name identifying its field. Dispatch the normal input event so preview and search consumers update. Hover brightens the icon without a fill or boundary. Reserve text padding so the value does not overlap the clear action.

Clear changes the draft and returns focus to the input. It does not submit a form or silently change its accepted value. Keep existing Enter, blur, Escape, Save, and Cancel contracts. Show Clear only while the pointer hovers over the actual input or Clear target, or focus remains within the field. Label hover does not reveal Clear. Keep a focused Clear visible. Hide clear when empty, read-only, or disabled. Synchronize it after input and programmatic value/state changes. A multiline clear target sits at the upper trailing edge, not the vertical center.

Structured values such as HEX can explicitly omit clearing when an empty value is invalid.

## Validation and transactions

Associate useful instructions and errors with the field. Keep errors visible and copyable. Explain the problem and recovery. Preserve the invalid draft so the user can repair it. Do not add generic helper text under every field. Empty hints and errors do not reserve space. Form Save validates and accepts the draft. Cancel restores accepted values according to the form owner.

Live preview does not remove confirmation. Keep drafts when switching related tabs if that owner preserves them. While pending, prevent duplicate submission and expose progress. Failure preserves valid input and offers retry. Focus the first invalid field after explicit submission when the user still owns that flow. Do not steal focus after the user moved elsewhere.

Single-line inspector examples accept valid Enter/blur and restore on Escape. Multiline Enter inserts a newline. Input-method composition must not trigger Enter or Escape commands. Preserve different existing product behavior until separately reviewed.

## Search and availability

Search filters content without masquerading as a submitted command. Preserve filtering and selection contracts from [Collections](collections.md). Explain why a field is unavailable when that information changes the user's next action. Keep read-only, disabled, empty, mixed, invalid, and pending states distinct. Do not expose a native text cursor or text selection on ordinary interface labels and hints.

[WAI form validation](https://www.w3.org/WAI/tutorials/forms/validation/).

## Value alignment

Ordinary text aligns to the writing direction's start edge, including inspector inputs. The name/value column layout does not imply trailing text alignment. Numbers align to the trailing edge for comparison. Color codes with a prescribed format retain their declared compact trailing alignment. Choose alignment by value role, not by feature name or a blanket inspector selector.

A multiline content editor occupies the group's full width below its name, including narrow inspectors. Do not squeeze authored prose into the compact trailing value column. Use an 80px minimum editing area, start-aligned text, vertical resizing, and the shared top-right Clear target. Short single-line properties retain the inline construction. Select this layout by editing role, not the field's name.

In narrow inspectors, move text editors below their labels before reducing the editable width. Multiline content always uses a separate full-width editor.
