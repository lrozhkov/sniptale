# i18n architecture

Sniptale ships Russian and English. `packages/runtime-contracts/src/i18n.ts` owns locale identifiers, Intl tags, and the fallback locale. Product catalogs own localized language names. English is the default language and the fallback language. Preserve an explicit stored language preference.

The registry also owns `nativeName`, which identifies each language in its own language. Welcome uses this identity metadata without loading inactive catalogs. Product catalogs retain localized language names for other contexts.

On first installation, the background install owner stores English only if no preference exists. It checks and writes under the existing exclusive persistence permit. A delayed install callback must preserve a user choice or restored preference. The initializer releases the permit before hydration. On update, it preserves the stored locale.

## Owners

- `apps/extension/src/platform/i18n/catalogs/` owns one authored JSON catalog per locale.
- `catalogs/en.json` defines the message structure and key order.
- `apps/extension/src/platform/i18n/types.ts` derives translation keys and dictionary types from the English catalog.
- `apps/extension/src/platform/i18n/catalog-store.ts` prepares scoped data and supplies synchronous lookup with fallback.
- `apps/extension/src/platform/i18n/catalog-reader.ts` reads nested projections without runtime state.
- `apps/extension/src/platform/i18n/catalog-profiles.ts` declares the permitted runtime selections.
- `apps/extension/src/platform/i18n/catalog-subsets.ts` declares compact shell message selections.
- `apps/extension/src/platform/i18n/catalog-transport.ts` reads bounded local resources or requests content data through a checked Port.
- `apps/extension/build/i18n-profile-selections.ts` selects owned domains and reachable message keys.
- `apps/extension/build/i18n-catalogs.ts` creates packaged JSON resources and the English bootstrap projection.
- `apps/extension/src/background/i18n/catalog-port.ts` registers the read-only content catalog Port.
- `apps/extension/src/platform/i18n/locale/state.ts` owns locale preference policy, events, and subscriptions.
- `apps/extension/src/composition/persistence/infrastructure/preference-service` owns raw browser-storage operations for these preferences.
- `apps/extension/src/platform/i18n/locale/hook.ts` owns the React locale subscription.
- `apps/extension/src/platform/i18n/index.ts` is the app runtime API.
- `apps/extension/src/background/runtime/routing/runtime-wiring/install.ts` owns locale initialization on first installation.
- `packages/runtime-contracts/src/i18n.ts` owns the canonical locale registry and strict identity validation.
- `packages/platform/src/i18n/**` owns formatting and preserves the established locale configuration API.

## Catalog contract

Keep product copy in the app catalogs. Packages must not import these catalogs. Product consumers use the existing i18n API and typed keys.

All catalogs contain the same nested structure and keys. Each message value is a string. The catalog guard rejects duplicate, missing, and extra keys. It also checks locale registration and value types.

Each catalog uses the English key order. Use two spaces for indentation, LF line endings, and one final newline. Do not add empty lines. Each message occupies one physical line, regardless of its length. The same key occupies the same physical line in every catalog.

Represent a newline inside a message with the JSON escape `\n`. Preserve the decoded text. Different translations can contain different numbers of newlines inside their values.

Catalogs have no line-width limit. The existing `npm run format:write` command applies their canonical format. Other files retain the ordinary formatter rules. Check mode reports differences without writing files. Formatting must not add translations or remove unknown keys.

Add all shipped translations for each new or changed message. If you add a locale, update the registry and add its complete catalog. Update dictionary, formatter, preference, and affected surface proof.

Wire contracts and settings transfer use the canonical locale identity. Do not duplicate language unions or receiver allowlists. Imported multilingual asset metadata retains its separate English fallback policy.

## Runtime boundaries

Translation remains synchronous after preparation. Before a surface uses translated copy, prepare its selected language and English fallback. Load each language only once when English is selected. Read packaged JSON data during startup, without additional feature imports or deferred feature loading.

The build emits one resource for each locale and runtime profile. Each resource contains owned message domains and reachable cross-owner keys. Collect exact references and anchored dynamic families from cached source snapshots. Reuse each selection for every locale. Do not create a separate TypeScript program or scan sources once per locale.

Keep authored JSON catalogs outside runtime JavaScript dependency graphs. Do not embed all-language projections in startup bundles. Only three English messages enter the bootstrap failure shell: its title, body, and Retry label. These messages come from the authored English catalog.

Extension documents and background read their packaged resources directly. Content requests only its permitted profile through the background Port. The broker checks sender identity, locale, profile, request count, and response size. It accepts no resource path or remote URL. Catalog loading has no durable writer and grants no operation authority.

The existing locale owner coordinates preferences and ready catalog data. Prepare a new language before publishing it to subscribers. A failed preparation preserves the previous ready interface and permits retry. A superseded language request must not overwrite a newer choice. Keep the preference storage key, mutation permit, and cross-window synchronization owner unchanged.

Reserve the existing persistence transition gate before preparing a language choice. Release it after preference persistence and paint-hint reconciliation. Privacy erasure waits for that complete operation. Delayed catalog completion must not recreate a removed preference or overwrite its restoration under the exclusive erasure gate.

Keep background and offscreen listener registration independent of catalog preparation. Lifecycle commands and readiness probes must remain available. Prepare data at the owner of translated work. Media permission UI prepares the language from its checked bootstrap before exposing controls.

Imported labels can contain keys outside the prepared selection. Preserve their supplied literal fallback instead of loading unrelated message domains. Do not classify errors or progress by comparing translated strings from every language. Send stable codes and structured parameters, then translate at the displaying surface.

Keep the initial popup shell independent of the full popup translator. Keep the content shim independent of React and the full app i18n runtime. Its preferences loader owns its prepared translator. Check emitted dependencies when message selections change.

Use shared formatters for dates, numbers, and lists that depend on the locale. Subscribe adopted React surfaces through the locale seam.

## QA

The existing i18n guard checks catalog structure and canonical formatting. Catalog changes must trigger this check even when no TypeScript file changes.

Build proof must add eight synthetic locales and compare emitted startup JavaScript. Additional locale messages must appear only in packaged data resources. Check owned domains, cross-owner references, dynamic families, and the exact English bootstrap exception. Reject full catalog imports and all-language virtual projections in runtime bundles.

Readiness proof covers initial preparation, retries, language changes, stale results, and failure without loss of completed work. Check actual popup and content interactions at both primary viewports. Preserve listener readiness while data preparation is pending or fails.

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
