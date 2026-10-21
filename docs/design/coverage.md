# Product coverage

[Design index](index.md) · [Surface-specific patterns](surfaces.md)

This bounded map records migrated chrome and inspected flows, not whole-application coverage. Product source owns specialized mechanics and state. Shared commands and parameter construction apply only within declared scopes. Pending consumers retain their existing contracts.

## Integration map

Unlinked native filenames use `tooling/test/e2e/extension-critical/` as their base.

| Surface | Adopted presentation and retained owners | Native proof |
| --- | --- | --- |
| Library | Navigation, filters, collections, preview, menus, dialogs. Properties retain plain rows, complete values, Clear and related-project navigation. Preserve virtual geometry, hidden selection, separate open targets, backup/import warnings, cancellation, retry, deletion and recovery. | `extension-critical-gallery-library-design.spec.ts` |
| Image editor | Floating chrome, tools, layers, scene/header/dimensions/metadata rows with bounded intrinsic content and complete translated values. Preserve docking, resizing, canvas coordinates, gestures, history, document authority, dense layer targets and paint cancellation. Proof imports PNG and checks native export. | `extension-critical-image-design.spec.ts` |
| Standalone video | Materials, recording/export controls, detached themed menus, preview and inspector stacks without compatibility margins. Captured gestures share controlled appearance fields with Gallery. Source clicks share effect, appearance, timing and position controls. Captured keyboard captions share display, typography, timing and placement fields. Local adapters retain section navigation, commands and disclosure preferences. Preserve collection geometry, project/import/export admission, timeline lanes, handles, time mapping, preview rendering and document fonts. | `extension-critical-standalone-video-design.spec.ts`, `extension-critical-video-editor-gesture-inspector.spec.ts`, `extension-critical-video-editor-click-feedback.spec.ts`, `extension-critical-video-editor-key-feedback.spec.ts` |
| Scenario | Guide/tour chrome, resources, properties, forms and export controls. Preserve selection, drafts, history, persistence, resource lifecycle, voice insertion/Clear and measured header priorities. Authored guide text and exported HTML retain bundled document fonts and geometry. Tour player, embedded image editor and prepared preview retain isolated rendering. | `extension-critical-scenario-design.spec.ts` |
| Settings | Page/unlock scopes, name/value adapter, separate sidebar/content scrolling, desktop minimum and outer scrolling. Preserve validation, drafts, Save/Cancel, pending admission, password masking/secrets, hotkey capture, menu reordering, collection gestures, permissions and authored annotation previews. Native-app presentation does not prove host integration. | `extension-critical-settings-design.spec.ts` |
| Content | Toolbar, annotation, Design Review and AutoBlur surfaces. Ordinary commands share fitted square targets and 16px glyphs. Content menus use compact rows and headings. Portals retain theme and interface font. Bootstrap installs bundled faces from trusted CSS. Preserve host isolation, actual zoom, placement, drafts, Undo, nested layers, drawing preferences and authored page/annotation/preview fonts. | `extension-critical-content-design.spec.ts`, `extension-critical-content-controls-design.spec.ts` |
| Saved-page viewer | Chrome, connected mode/catalog tabs, native download links and compact nonvisual resources. Preserve preview Back/Escape/focus, desktop scrolling, saved iframe fonts/selection/geometry and its token boundary. Proof saves a real package. | `extension-critical-web-snapshot-viewer-design.spec.ts` |
| Camera recorder | Live/result commands and interface font. Preserve acquisition, devices, lifecycle, results, duration clock, local discard state/focus and actual recorder-window bounds. No desktop minimum applies. Proof starts through popup with synthetic media, permission and registration. | `extension-critical-camera-recorder-design.spec.ts` |
| Content recorder | Sidebar and active toolbar commands. Preserve drag, step order, previews, capture, metadata focus/Escape/opener, project query/creation/search/Clear, trusted Start, lifecycle, devices and spotlight. Properties remain neutral and drawing tools retain tool states. | `extension-critical-content-recorder-design.spec.ts` |
| Content AI | Local dialog, template/model selection and nested Escape, search Clear/focus. Preserve tree selection/filtering/column exclusions/payload, specialized tree rhythm, JSON syntax/copy/scroll/resize, prompt/voice, admission, provider settings and failure recovery. Proof uses page selection and Settings loopback provider for waiting cancellation, retained drafts, failure and retry. | `extension-critical-content-ai-design.spec.ts` |
| Content utilities | Compact Save dialog, filename Clear, multiline destinations and viewport property menu. Preserve trusted native actions, refusal/drafts, session choice, actual resize and restoration. | `extension-critical-content-utility-design.spec.ts` |
| Exported Tour player | Interface fonts from canonical declarations, compact chrome and isolated authored typography. Preserve media, navigation, focus, exact admission and historical artifacts. | [Standalone](../../tooling/test/e2e/tour-player/tour-player-chrome.spec.ts), [embedded](../../tooling/test/e2e/scenario-editor-visual/scenario-tour-frame.spec.ts) |
| Common inspector interactions | Value-only hover, keyboard focus, contextual range containment, intrinsic segment fit, Clear visibility and optical alignment. Preserve native editing and acceptance owners. | `extension-critical-inspector-interaction-design.spec.ts` |

Existing component and engine suites retain failure, pending, recovery, keyboard, draft, editing, persistence, voice, parser, apply-back, recording and artifact proof. Native compositions do not replace them. Check languages, themes, primary viewports, applicable breakpoint neighbors and below-minimum scrolling. Screenshots and results belong to migration records.

## Reference requirements and inspected owners

Rules cover Collections, Selection, Buttons, Properties, Fields, Layers, Navigation, Choices, Numbers, Compositions and Specialized controls.

- [Combined inspector and browser-header examples](../../tooling/design-reference/examples/compositions/index.html): All/category presentation, URL/icon actions, proportions/resolution/Fit/Crop, full-column source/custom menus, beginning/end fades and retained branches.
- [Collection examples](../../tooling/design-reference/examples/collections/index.html): background/presentation/watermark acquisition/replacement, selected comments and inline editing.
- [Numeric examples](../../tooling/design-reference/examples/numbers/index.html): separate typed/scrub bounds for padding/radius, gain and webcam size/crop.
- Recording probes cover Tab/Screen/Camera dependencies, unavailable devices/quality/countdown/viewport, codec/resolution/FPS, microphone processing/live-test rejection and setup versus live/completion state. Preserve dependent unavailable output values.

Inspected source paths use `apps/extension/src/`:

- `gallery/video-review/{inspector,inspector-sections,scene-inspector,background-inspector,presentation-inspector}.tsx`
- `ui/watermark/inspector.tsx`
- `ui/action-audio/fields.tsx`
- `ui/presentation-media-fields.tsx`: Both editor bookends share fit, crop, duration, trim and sound controls. Local adapters retain acquisition, paused preview, history and disclosure preferences.
- `video-editor/workspace/sidebar/selection/inspection/scene-bookend-*.tsx`: Native recipes create ordinary linked media and fill clips. `extension-critical-video-editor-bookends.spec.ts` checks inspector widths, fonts, keyboard selection, reopen and encoded output.
- `workflows/browser-frame/settings.tsx`
- `popup/recording/video/setup/body.tsx`
- `popup/recording/video/settings/layout.tsx`
- `ui/popup-shell/inline-curtain/select.tsx`

## Exclusions

Preserve crop coordinates, decoding/import, native files, recording/media/clocks, device permissions, CompactPaintSelector and color/paint internals, gestures, capture, persistence and production Undo. Specimen pending/error/recovery does not prove native-engine parity. Ordinary requirements above have working examples.

Popup probes establish dependencies and curtain behavior, not replacement layout. Popup remains excluded. Complete paint selectors, timeline, canvas and native engines retain existing implementations and require separate integration proof.
