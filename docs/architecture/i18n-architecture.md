# i18n architecture

Sniptale ships Russian and English. `packages/platform/src/i18n/config.ts` owns locale identifiers, Intl tags, display names, and the fallback locale. The background install owner persists English on first installation and preserves the stored locale on update.

## Owners

- `packages/platform/src/i18n/**` owns package-pure locale configuration and formatting.
- `apps/extension/src/platform/i18n/messages/**` owns product messages with locale variants colocated at each leaf.
- `apps/extension/src/platform/i18n/dictionaries.ts` builds runtime dictionaries.
- `apps/extension/src/platform/i18n/types.ts` derives translation keys and contracts.
- `apps/extension/src/platform/i18n/locale/state.ts` owns preference persistence, events, and subscriptions.
- `apps/extension/src/platform/i18n/locale/hook.ts` owns React locale subscription.
- `apps/extension/src/platform/i18n/index.ts` is the app runtime API.
- `apps/extension/src/background/runtime/routing/runtime-wiring/install.ts` owns first-install locale initialization.

## Change rules

Put product copy in message section modules. Use shared formatters for locale-aware dates, numbers, and lists. Subscribe adopted React surfaces through the locale seam. Add both shipped translations for each new or changed user-facing message.

When adding a locale, update the registry, every message leaf, dictionary and key proof, formatter proof, preference behavior, and affected surface tests.

## Document and window titles

Browser tabs and standalone windows identify the current document first. Use its trimmed display name without a Sniptale prefix or suffix. Keep the stored name unchanged when formatting browser metadata. Name and locale changes update the title without reopening the page.

Only add a localized mode after a middle dot when it distinguishes a useful context. A web snapshot keeps `Name · Web Snapshot` to distinguish the saved copy from the original website. Scenario preview uses `Name · Preview` to distinguish it from editing. Image and video editing need no suffix. Switching between screenshot and static-document projections of one snapshot retains the same document title.

Before a name is available, and for empty or unavailable documents, use the localized short role: Image editor, Video editor, Scenario editor, or Web Snapshot. The same role is a deliberate fallback during loading; loading and failure details remain in the page. Static HTML uses the English role until locale hydration.

### Surface inventory

| Surface | Named state | Fallback / ownership |
| --- | --- | --- |
| Image editor tab/window | Current image display name | Image editor; editor page subscribes to its store |
| Video editor tab/window | Current project name | Video editor; shell reads the project controller |
| Scenario editor tab/window | Current project name | Scenario editor; page reads the project session |
| Scenario reader/tour preview | Project name · Preview | Scenario editor; same page owns the mode |
| Web snapshot viewer | Source title · Web Snapshot | Web Snapshot; loaded package owns the source title |
| Embedded image editing | Parent scenario title remains authoritative | Child frame metadata cannot replace parent metadata |
| Exported guide/tour HTML | Project name | Existing export owners retain their document title |
| Gallery media preview | Library tab remains unchanged | Preview is a modal within the library |

Settings, Library, popup, camera recorder, design system, offscreen and execution sandboxes are utility contexts, not document editors or viewers. Their existing role/brand policies are unchanged. Never rewrite the host website's title.

### Image name editing

The standalone image header exposes its complete displayed name as a native tooltip and a keyboard-operable button. Activation replaces header actions with a focused, selected text input using the existing header width. Enter or blur accepts a trimmed nonempty name; an empty value retains the current name. Escape cancels. Keyboard completion restores focus to the title. Input owns keyboard events while editing.

The active image workflow commits the name through the existing autosave owner, then publishes it to the editor store. Pending submission rejects duplicate Enter/blur. A failed save preserves the draft with visible feedback and allows Enter to retry or Escape to cancel. Changing or closing the document discards its input state. Renaming does not alter source image data or browser-frame annotations.

The current caption supplies the proposed Download and Save As filename. Explicit Save As input can change that name. The filename owner normalizes the leaf and replaces image extensions with the selected output format; unnamed editor output retains the configured fallback rule. Completed caption edits enter the common document history as one step, and undo or redo publishes the restored caption in the document snapshot consumed by the existing autosave writer. Reopening a persisted image restores its saved display name.
