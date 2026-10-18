# Field accessories

[Fields and forms](fields.md) · [Foundations](foundations.md)

## Clear action

Editable nonempty text fields have a trailing 24px clear target inside the field. Use the shared cross icon. Give clear an accessible name identifying its field. Dispatch the normal input event so preview and search consumers update. Hover brightens the icon without a fill or boundary. Reserve text padding while Clear is visible so the value does not overlap its target. A single-line inline field reclaims that padding while Clear is hidden. Keep multiline text padding stable to prevent hover from changing line breaks.

Clear changes the draft and returns focus to the input. It does not submit a form or silently change its accepted value. Keep existing Enter, blur, Escape, Save, and Cancel contracts.

Show Clear only while the pointer hovers over the actual input or Clear target, or focus remains within the field. Label hover does not reveal Clear. Keep a focused Clear visible.

Hide clear when empty, read-only, or disabled. Synchronize it after input and programmatic value/state changes. A multiline clear target sits at the upper trailing edge, not the vertical center.

Structured values such as HEX can explicitly omit clearing when an empty value is invalid. A compact rename control can also omit Clear when an adjacent cross closes the document. Preserve full text selection and keyboard replacement. Match the edit height to the surrounding toolbar controls.

## Compound fields and dictation

Fields with trailing actions use one compound row: a shrinking flexible field and automatic action width. Pin actions to the trailing edge. Expand the field across the available space. Preserve this relationship at narrow and wide container widths.

Reserve usable text space separately from Clear, voice, and submit targets in compound fields. Adding an action must not consume the query or value area. Use an explicit text budget for the editing role and let translated action labels keep their natural width. Measure the remaining text area after padding and reserved targets. The outer field width alone does not prove usability.


For a field with Clear and dictation, keep their target positions stable while either action is visible. A single-line title can reclaim hidden accessory space at rest. Removing an empty-field Clear must not move the microphone or change text wrapping. Keep a usable text budget before collapsing other header commands. A multiline AI prompt can retain separate upper Clear and lower dictation actions. Preserve that composition instead of forcing both actions onto one line.

Idle dictation uses a quiet icon that brightens on hover. Keep active, stopping, and error feedback visible outside hover and focus. Derive document editing icons from the local paper and ink, including Clear hover. Do not use a dark shell's bright foreground on light document content. Clearing a dictated draft stops its insertion owner before accepting the empty value. Reject late speech for that cleared placement while preserving a new deliberate recording.

Integration references: [Guide voice fields](../../apps/extension/src/scenario-editor/page-shell/voice-field.tsx) and [review composer](../../apps/extension/src/gallery/video-review/composer.tsx). Their existing native scenarios cover real field composition. The field specimen does not replace browser speech acquisition or permission handling.
