# i18n architecture

Sniptale ships Russian and English. `packages/platform/src/i18n/config.ts` owns locale identifiers, Intl tags, and the fallback locale. Product catalogs own localized language names. The fallback locale remains Russian.

On first installation, the background install owner stores English only if no preference exists. It checks and writes under the existing exclusive persistence permit. A delayed install callback must preserve a user choice or restored preference. The initializer releases the permit before hydration. On update, it preserves the stored locale.

## Owners

- `apps/extension/src/platform/i18n/catalogs/` owns one authored JSON catalog per locale.
- `catalogs/en.json` defines the message structure and key order.
- `apps/extension/src/platform/i18n/types.ts` derives translation keys and dictionary types from the English catalog.
- `apps/extension/src/platform/i18n/dictionaries.ts` supplies full runtime catalogs.
- `apps/extension/src/platform/i18n/catalog-reader.ts` owns synchronous lookup and fallback behavior.
- `apps/extension/src/platform/i18n/catalog-subsets.ts` declares compact message selections.
- `apps/extension/build/i18n-catalogs.ts` creates compact catalogs during the build.
- `apps/extension/src/platform/i18n/locale/state.ts` owns locale preference policy, events, and subscriptions.
- `apps/extension/src/composition/persistence/infrastructure/preference-service` owns raw browser-storage operations for these preferences.
- `apps/extension/src/platform/i18n/locale/hook.ts` owns the React locale subscription.
- `apps/extension/src/platform/i18n/index.ts` is the app runtime API.
- `apps/extension/src/background/runtime/routing/runtime-wiring/install.ts` owns locale initialization on first installation.
- `packages/platform/src/i18n/**` owns pure locale configuration and formatting in the package.

## Catalog contract

Keep product copy in the app catalogs. Packages must not import these catalogs. Product consumers use the existing i18n API and typed keys.

All catalogs contain the same nested structure and keys. Each message value is a string. The catalog guard rejects duplicate, missing, and extra keys. It also checks locale registration and value types.

Each catalog uses the English key order. Use two spaces for indentation, LF line endings, and one final newline. Do not add empty lines. Each message occupies one physical line, regardless of its length. The same key occupies the same physical line in every catalog.

Represent a newline inside a message with the JSON escape `\n`. Preserve the decoded text. Different translations can contain different numbers of newlines inside their values.

Catalogs have no line-width limit. The existing `npm run format:write` command applies their canonical format. Other files retain the ordinary formatter rules. Check mode reports differences without writing files. Formatting must not add translations or remove unknown keys.

Add all shipped translations for each new or changed message. If you add a locale, update the registry and add its complete catalog. Update dictionary, formatter, preference, and affected surface proof.

## Runtime boundaries

Translation remains synchronous. Full catalogs serve the app API. Separate build projections serve the initial popup shell, popup screens, and content shim. These projections contain no additional authored translations.

Keep the initial popup shell independent of the full popup translator. Keep the content shim independent of React and the full app i18n runtime. Check emitted dependencies when message selections change.

Use shared formatters for dates, numbers, and lists that depend on the locale. Subscribe adopted React surfaces through the locale seam.

## QA

The existing i18n guard checks catalog structure and canonical formatting. Catalog changes must trigger this check even when no TypeScript file changes.

Catalog-only changes select exact product tests through `productionDataFiles` in the existing owner map. Register each new locale catalog in that mapping. Changes to `catalogs/en.json` also trigger typecheck proof for the key contract. Code coverage rules remain unchanged.

Usage analysis reports candidate unused keys and unresolved dynamic lookups. Test references do not establish product use. An unresolved dynamic lookup does not prove the absence of product use. Do not remove keys automatically.

Keep usage analysis lightweight. Reuse existing source snapshots and AST traversal. Do not create a separate full TypeScript program or scan sources once per locale. Measure added cost before mandatory use. Scoped results must not claim complete evidence after a consumer changes or disappears.

## Document and window titles

Browser tabs and standalone windows identify the current document first. Use its trimmed display name without a Sniptale prefix or suffix. Keep the stored name unchanged when you format browser metadata. Name and locale changes update the title without reopening the page.

Add a localized mode after a middle dot only if it distinguishes a useful context. A web snapshot keeps `Name · Web Snapshot` to distinguish the saved copy from the original website. Scenario preview uses `Name · Preview` to distinguish it from editing. Image and video editing need no suffix. A switch between screenshot and static-document projections of one snapshot retains the same document title.

Before a name is available, use the localized short role. Also use that role for empty or unavailable documents. The roles are Image editor, Video editor, Scenario editor, and Web Snapshot. This role is also the deliberate fallback during loading. Keep loading and failure details in the page. Static HTML uses the English role until locale hydration.

### Surface inventory

| Surface | Named state | Fallback / ownership |
| --- | --- | --- |
| Image editor tab/window | Current image display name | Image editor. The editor page subscribes to its store. |
| Video editor tab/window | Current project name | Video editor. The shell reads the project controller. |
| Scenario editor tab/window | Current project name | Scenario editor. The page reads the project session. |
| Scenario reader/tour preview | Project name · Preview | Scenario editor. The same page owns the mode. |
| Web snapshot viewer | Source title · Web Snapshot | Web Snapshot. The loaded package owns the source title. |
| Embedded image editing | Parent scenario title remains authoritative | Child frame metadata cannot replace parent metadata. |
| Exported guide/tour HTML | Project name | Existing export owners retain their document title. |
| Gallery media preview | Library tab remains unchanged | Preview is a modal within the library. |

Settings, Library, popup, camera recorder, design system, offscreen, and execution sandboxes are utility contexts. They are not document editors or viewers. Their existing role and brand policies remain unchanged. Never rewrite the host website's title.

### Image name editing

The standalone image header displays its complete displayed name in a native tooltip and a button that supports keyboard use. Activation replaces header actions with a text input at the existing header width. Activation gives the input focus. It selects the input text.

Enter or blur accepts a trimmed nonempty name. An empty value retains the current name. Escape cancels.

Keyboard completion restores focus to the title. The input owns keyboard events during editing. The active image workflow commits the name through the existing autosave owner. It then publishes the name to the editor store. Pending submission rejects duplicate Enter/blur.

A failed save preserves the draft with visible feedback. Enter can retry the save, and Escape can cancel. A document change or closure discards the input state. A rename does not change source image data or browser-frame annotations.

The current caption supplies the proposed Download and Save As filename. Explicit Save As input can change that name. The filename owner normalizes the leaf. It replaces image extensions with the selected output format. Unnamed editor output retains the configured fallback rule.

Completed caption edits enter the common document history as one step. Undo or redo publishes the restored caption in the document snapshot. The existing autosave writer consumes that snapshot. Reopening a persisted image restores its saved display name.
