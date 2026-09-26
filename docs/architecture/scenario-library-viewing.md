# Scenario viewing from Library

This document owns the implemented Library opening and refresh semantics, following the design recorded before implementation. Runtime isolation policy remains owned by [runtime contexts](runtime-contexts.md), [manifest permissions](../security/manifest-permissions.md) and [data handling](../security/data-handling.md).

## Decision

Open the latest committed scenario project as a full-page HTML presentation in a new scenario-page tab. Provide separate “Open guide” and “Play tour” actions for the two representations. Use the existing scenario runtime as the trusted read-only host and reuse the manifest tour-preview sandbox to execute the prepared standalone document. Keep the guide and tour producers separate. Do not route executable scenario documents through Web Archive Viewer.

Generate a disposable HTML artifact on opening. Keep its bytes fixed for that viewing session. Regenerate from the latest committed project only on explicit refresh or reopening. Do not create an export-history entry, change the project, request a file picker, or retain a durable HTML copy just to view a scenario.

## Source evidence

Paths below are relative to `apps/extension/src/` unless linked otherwise.

| Concern | Existing owner and consequence |
| --- | --- |
| Library preview | `gallery/library/preview/scenario-stage.tsx` reads recent project steps for both project and export items. Its thumbnails remain an orientation aid alongside the full-page opening actions; they do not display exported bytes. |
| Project | `composition/persistence/scenario/contracts.ts` stores a `GuideProject`, owner-issued `workspaceRevision`, timestamps, lifecycle and optional saved-version history. The project includes guide items, style, print and HTML image settings, plus an independently authored optional `tour`. |
| Media | The same contracts reference media assets; immutable bytes belong to the asset persistence owners. Project JSON and a thumbnail alone are insufficient to prepare the complete HTML. |
| Export history | `composition/persistence/scenario/store/project-records/exports.ts` stores ID, project ID, format, filename, timestamp and size. It stores no HTML bytes, file handle, source revision, guide/tour discriminator, content digest or complete export settings. Saved project history is not an export snapshot. |
| Guide HTML | `scenario-editor/page-shell/html-document.tsx` embeds styles, fonts and a hash-authorized viewer script. `page-shell/runtime/html-export.ts` replaces raster placeholders while streaming to a file sink. The intermediate HTML string is not a finished file. |
| Tour HTML | `scenario-editor/page-shell/runtime/tour-html.ts` prepares a detached Blob including image/audio assets and baked privacy redactions; preview and download share those exact bytes. Missing media, incomplete slides and exceeded budgets reject preparation. |
| Sandbox | `tour-preview-sandbox/index.ts` accepts one bounded HTML Blob using parent source, origin and per-mount nonce validation, then owns the child Blob URL. Its protocol is tour-named, validates guide/tour mode, reports bounded readiness/failure and is capped at 192 MiB. |

## Viewer alternatives

| Viewer | Suitability | Decision |
| --- | --- | --- |
| Web Archive Viewer (`web-snapshot-viewer`) | Its offline document policy defaults to no resources except explicitly admitted local assets. Its iframe uses `allow-same-origin` without `allow-scripts`. It serves sanitized archived pages and parent DOM interactions. It would suppress tour playback and guide JavaScript interactions. | Preserve this passive-content boundary. Enabling scripts in this same-origin arrangement is not an acceptable reuse strategy. |
| Existing guide reader and editor tour preview | They already support authoring-oriented reading or preview, but are not necessarily the complete exported file. | Reuse producer and layout logic within the scenario owner; do not present an editor scene as exact exported HTML. |
| Tour manifest sandbox | Already isolates an executable standalone tour from the extension APIs and privileged DOM. | Reuse its transport and execution boundary for generated scenario HTML, subject to the guide compatibility and security proof below. |
| Separate scenario viewer runtime | Could own the same isolated child but would duplicate loading, navigation and runtime registration. | Reserve for a demonstrated inability to keep scenario-page loading read-only. A separate runtime is not required for the selected design. |

Chrome documents that manifest sandbox pages have a unique origin, lack extension APIs and direct access to normal extension pages, and use a separate CSP. This supports the isolation choice; it does not prove this repository's nested-frame implementation works in a built extension. See [Chrome manifest sandbox documentation](https://developer.chrome.com/docs/extensions/reference/manifest/sandbox).

## Content authority and edits

| Source | After project changes | Storage and product cost |
| --- | --- | --- |
| Latest committed project, generated on demand | A new opening uses the new committed version. An already open document stays fixed until refresh. Unsaved editor changes are excluded. | Uses existing project/media persistence; preparation can fail when media is missing or the project is unavailable. Selected for the initial feature. |
| Immutable exported copy | Always shows the original exported bytes, even after edits. It can survive deletion of its source only if it owns an independent durable asset root. | Requires explicit publication, format and guide/tour identity, source revision, digest, asset ownership, quota, deletion/trash, backup/restore and privacy-erasure contracts. Defer to a separate storage feature. |

Do not label regeneration from an export-history row as “Open exported file.” Such a row may offer “Open current project” with the current-version meaning made explicit. Historical rows cannot identify whether an HTML export was a guide or a tour; offer the representations available on the current project. Do not infer a local file location from its filename or silently substitute current content for a historical export.

Bind one preparation to a detached committed project and its media references. Resolve the revision through the persistence authority rather than a wall-clock timestamp or Gallery's cached summary. If referenced assets disappear during preparation, fail with a retryable unavailable-media state; never combine refreshed JSON with an older partially prepared artifact. Keep refresh single-flight, cancel obsolete jobs, and reject stale results. Opening or refreshing a trashed, deleted, unsupported or invalid project must show an explicit unavailable state without repair or writes.

## User flow and ownership

1. Show “Open guide” on a readable guide project and “Play tour” when a tour exists. A project can expose both actions. Keep “Edit” separate and keep thumbnails as list orientation only.
2. Navigate through `platform/navigation/extension-pages/scenario-editor.ts` using a validated `view=guide|tour` parameter alongside `projectId`. Missing view retains the existing editor route; an unsupported view must fail explicitly. Gallery sends identity and mode, not HTML or media bytes in the URL.
3. Branch into a read-only host before mounting editor mutation, autosave, recording or AI controllers. The host owns persistence admission/read, preparation, progress, cancellation, refresh, retry and the sandbox mount. Gallery never imports sibling `scenario-editor` implementations.
4. Present a full-width document with compact project title, representation, “saved version” context, refresh and edit controls. Start preparation without an export dialog. Keep loading, empty, unavailable and failure states accessible; failure offers retry or edit. Preserve Library selection in its original tab.
5. Keep the selected guide reading options disposable, initially using the existing flow/top defaults and persisted image-export settings. Bind theme and locale to each prepared artifact. For tours, use the existing export defaults, preserve animations, transitions, hotspots and narration, and start audio through player interaction when browser autoplay policy requires it. Missing or incomplete tours offer editing; viewing must not generate or mutate a tour.

Keep guide document composition, raster materialization and tour preparation under the scenario runtime. The abortable, bounded guide Blob preparation path reuses the same raster writer as export; do not copy the placeholder replacement algorithm or bypass image privacy processing. Keep saving and export-history side effects outside preparation. When adding download from a viewer, save its prepared bytes rather than regenerating a different document.

The sandbox remains the unprivileged execution owner. Its existing tour-named transport now validates an explicit guide/tour mode; both the editor export preview and the Library viewer use the same receiver. No runtime or public import path is moved.

## Isolation requirements for implementation

Accept only artifacts produced by the trusted local guide/tour pipeline from parsed project data. MIME, size and nonce checks validate the transport, not HTML safety. Arbitrary imported HTML is outside this execution contract.

Retain the two sandbox layers without `allow-same-origin`, top navigation, forms, downloads or extension API access. Preserve source/origin/nonce binding and one accepted artifact per mount. A replacement artifact gets a fresh mount and nonce. Release the Blob URL on teardown and cancel parent preparation when its host closes. Add bounded readiness/failure feedback so a missing or rejected frame cannot remain a blank successful preview; any child status message must be parsed and bound to the current frame and nonce, with no privileged command authority.

Retain the standalone document's hash-based script CSP and deny network fetches, remote frames and external resources. Do not weaken the extension-page CSP or the effect sandbox. Built-extension proof reproduced blocked guide fonts under the prior shared manifest policy. The policy now admits only `font-src data:` for embedded guide fonts, with the exact release-artifact expectation updated. The effect sandbox retains its restrictive head policy.

Tour URL actions currently use a new tab with `noopener noreferrer`; the sandbox permits popups and popup escape for that behavior. Preserve only parser-validated supported URLs reached through an explicit user action. Treat opening an external destination as deliberate navigation, distinct from automatic network access by the HTML. Prove that content cannot request parent storage, editor mutations, downloads or privileged browser actions through messages.

## Implementation acceptance and proof

Both Library actions require route-level proof that viewing performs no project writes or export-history writes. Exercise guides with navigation, text, images, fonts and image zoom, and tours with slide navigation, timed animation, hotspots, baked redactions and narration. Verify the guide Blob contains resolved raster bytes and matches the export producer's content.

Run built-extension browser proof for both modes: effective CSP, extension API/storage isolation, script execution, denied remote requests, rejected forged/replayed/oversized messages, user-initiated external links and frame teardown. Existing unit tests and source inspection do not substitute for this proof. Preserve the effect-sandbox artifact checks when touching shared sandbox policy.

Cover reload after a committed edit, exclusion of unsaved editor changes, stable already-open playback, cancellation during preparation, stale completion, missing assets, deletion/trash, invalid or future project data, empty guide and absent/incomplete tour. Check keyboard operation, visible focus, translated labels, theme, reduced motion, narrow viewport, progress and recovery controls against `DESIGN.md`. Run preflight on actual implementation files and all checkpoint-routed security/architecture reviews before closeout.
