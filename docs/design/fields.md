# Fields and forms

[Working example](../../tooling/design-reference/examples/fields/index.html) · [Foundations](foundations.md)

## Structure

Use persistent secondary labels and primary editable values. A placeholder is an example, not a label. Use a single-line field for short text, multiline input for prose, and a search field for filtering. Editable text and color inputs have no surface or frame at rest. Hover or focus reveals a neutral surface and subtle boundary. Keep their input target usable at rest. Keep 32px default height, 4px label gap, and the shared typography. Let multiline content use its own scroll/resize owner.

Read-only values remain selectable and copyable. Disabled values retain their actual content. Mixed values are explicit and are not a literal accepted string such as “Different values.”

## Continuous interaction

The input owns its hover paint and activation. Parameter names and intervening gaps do not focus or activate editors. Use aria-labelledby to retain the accessible name without native label forwarding. Boolean named toggles retain their explicit action. Clicking within the input preserves editing.

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

The explicit compact inspector uses a 32px input in the first band of a 40px parameter row. Preserve the 8px lower strip across equivalent inline controls. Stacked label/control constructions omit this dormant strip. Their 32px name band, 4px gap, and 32px control occupy 68px. General forms retain their 32px control height. Stack long editors below their names before narrowing the editable text.

Inline text, numeric, and HEX editors share a quiet idle state and a light neutral 1px boundary with a subtle surface during editing. Keep keyboard focus distinct with a 1px accent frame. Numeric units remain visible outside the editable value. See [Numeric controls](numbers.md) for expansion and alignment.

Empty editable fields keep an explicit placeholder. Preserve a useful caller example. Otherwise reuse the translated field name. Keep placeholders distinct from accepted text and readable in both themes. Do not use placeholder text as the accessible label.

Fields with trailing actions use one compound row: a shrinking flexible field and automatic action width. Pin actions to the trailing edge. Expand the field across the available space. Preserve this relationship at narrow and wide container widths.

Reserve usable text space separately from Clear, voice, and submit targets in compound fields. Adding an action must not consume the query or value area. Use an explicit text budget for the editing role and let translated action labels keep their natural width. Measure the remaining text area after padding and reserved targets. The outer field width alone does not prove usability.


For a field with Clear and dictation, reserve each target independently of its visibility. Removing an empty-field Clear must not move the microphone or change text wrapping. Keep a usable text budget before collapsing other header commands. A multiline AI prompt can retain separate upper Clear and lower dictation actions. Preserve that composition instead of forcing both actions onto one line.

Idle dictation uses a quiet icon that brightens on hover. Keep active, stopping, and error feedback visible outside hover and focus. Derive document editing icons from the local paper and ink, including Clear hover. Do not use a dark shell's bright foreground on light document content. Clearing a dictated draft stops its insertion owner before accepting the empty value. Reject late speech for that cleared placement while preserving a new deliberate recording.

Integration references: [Guide voice fields](../../apps/extension/src/scenario-editor/page-shell/voice-field.tsx) and [review composer](../../apps/extension/src/gallery/video-review/composer.tsx). Their existing native scenarios cover real field composition. The field specimen does not replace browser speech acquisition or permission handling.
