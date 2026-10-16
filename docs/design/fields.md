# Fields and forms

[Working example](../../tooling/design-reference/examples/fields/index.html) · [Foundations](foundations.md)

## Structure

Use persistent secondary labels and primary editable values. A placeholder is an example, not a label. Hide it when the caret enters the input or textarea through a click or keyboard navigation. Pointer hover alone must not hide it. Restore it when the empty field loses focus. Keep field geometry stable. Use a single-line field for short text, multiline input for prose, and a search field for filtering. Editable text and color inputs have no surface or frame at rest. Hover or focus reveals a neutral surface and subtle boundary. Keep their input target usable at rest. Keep 32px default height, 4px label gap, and the shared typography. User-entered text uses the document font family. Labels and actions use the interface family. Let multiline content use its own scroll/resize owner.

Read-only values remain selectable and copyable. Disabled values retain their actual content. Mixed values are explicit and are not a literal accepted string such as “Different values.”

## Continuous interaction

The input owns its hover paint and activation. Parameter names and intervening gaps do not focus or activate editors. Use aria-labelledby to retain the accessible name without native label forwarding. Boolean named toggles retain their explicit action. Clicking within the input preserves editing.

Pointer focus does not draw the keyboard-only frame. Tab retains visible focus.

## Clear action

Follow [Field accessories](field-accessories.md#clear-action) for Clear geometry, visibility, focus, draft behavior, and invalid-empty exceptions.

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

The explicit compact inspector uses a 32px input in the first band of a 40px parameter row. Preserve the 8px lower strip across equivalent inline controls. Stacked label/control constructions omit this dormant strip. Their 32px name band, 4px gap, and 32px control occupy 68px. General forms retain their 32px control height. Stack long editors below their names before narrowing the editable text.

Inline text, numeric, and HEX editors share a quiet idle state and a light neutral 1px boundary with a subtle surface during editing. Keep keyboard focus distinct with a 1px accent frame. Numeric units remain visible outside the editable value. See [Numeric controls](numbers.md) for expansion and alignment.

Empty editable fields keep an explicit placeholder. Preserve a useful caller example. Otherwise reuse the translated field name. Keep placeholders distinct from accepted text and readable in both themes. Do not use placeholder text as the accessible label.

Follow [Field accessories](field-accessories.md#compound-fields-and-dictation) for trailing actions, text budgets, and dictation.
