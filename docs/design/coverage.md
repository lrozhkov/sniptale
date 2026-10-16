# Product coverage

[Design index](index.md)

[Surface-specific patterns](surfaces.md) limit generic rules for popup, timeline, canvas, and embedded UI. This bounded inventory examines the quick video inspector, library, image editor, and recording setup. It is not a whole-application coverage claim. Existing product source remains authoritative for specialized mechanics and state ownership.

| Reachable flow | Rule owners | Reference requirement |
| --- | --- | --- |
| Library cards, rows, filters and batch actions | Collections, Selection, Buttons | Preserve virtual geometry, hidden selection and separate open targets |
| Library preview properties and related projects | Properties, Fields, Collections | Plain name/value rows, complete values, native Clear and navigation |
| Library backup, import, recovery and deletion | Layers, Fields, Buttons | Visible warnings, retry, cancellation and reachable short-height actions |
| Scenario guide/tour chrome, resources and forms | Buttons, Fields, Collections | Keep authored content, voice insertion and resource lifecycle owners |
| Scenario properties and export controls | Compositions, Choices, Specialized | Shared parameter rows with independent document fonts and output preparation |
| Standalone video materials, export and recording | Buttons, Fields, Collections | Preserve project, import, export and recording admission |
| Standalone timeline, preview and inspector | Specialized, Compositions | Keep gesture geometry, canvas fonts and shared parameter construction |
| Image editor floating chrome, tools and layers | Buttons, Collections, Specialized | Preserve docking, dense row actions, gestures and document authority |
| Image scene, browser header, dimensions and metadata | Compositions, Properties, Choices | Shared rows, bounded intrinsic content and full translated values |
| Scene proportions, resolution, Fit/Crop | Choices, Compositions | Full-column menu and source/custom values |
| Inspector All/category presentation | Navigation, Compositions | [Combined presentation](../../tooling/design-reference/examples/compositions/index.html), retained values |
| Browser header style, address, icon import | Fields, Buttons, Compositions | [URL and asynchronous icon actions](../../tooling/design-reference/examples/compositions/index.html) |
| Background paint presets and custom paint | Choices, Layers, Specialized | Preserve actual CompactPaintSelector internals |
| Background, presentation, watermark media | Collections, Compositions | [Resource acquisition and replacement](../../tooling/design-reference/examples/collections/index.html) |
| Padding/radius wider typed bounds | Numbers, Specialized | [Separate typed/scrub bounds](../../tooling/design-reference/examples/numbers/index.html) |
| Beginning/end media and fade groups | Navigation, Compositions | Nested branch and retained values |
| Comments selection and inline editing | Collections, Fields | [Selected row and inline composer](../../tooling/design-reference/examples/collections/index.html) |
| Tab/Screen/Camera capture setup | Selection, Compositions | Dependent source options and unavailable reasons |
| Device, quality, countdown, viewport choice | Layers, Choices | [Popup-specific recording probe](../../tooling/design-reference/examples/compositions/index.html) |
| Output profile/codec/resolution/FPS | Choices, Compositions | Dependent unavailable values retained |
| Microphone processing with live test | Selection, Compositions | Persistent setting with pending/rejected capability state |
| Gain, webcam size/crop | Numbers | Range-only value presentation |
| Recording live actions and completion | Buttons, Compositions | Live state distinct from setup configuration |

## Inspected source entry points

- apps/extension/src/gallery/video-review/inspector.tsx
- apps/extension/src/gallery/video-review/inspector-sections.tsx
- apps/extension/src/gallery/video-review/scene-inspector.tsx
- apps/extension/src/gallery/video-review/background-inspector.tsx
- apps/extension/src/gallery/video-review/presentation-inspector.tsx
- apps/extension/src/gallery/video-review/watermark-inspector.tsx
- apps/extension/src/workflows/browser-frame/settings.tsx
- apps/extension/src/popup/recording/video/setup/body.tsx
- apps/extension/src/popup/recording/video/settings/layout.tsx
- apps/extension/src/ui/popup-shell/inline-curtain/select.tsx

## Library integration

The library uses the existing shared command press owner and canonical interface family. Its visual scope includes admission, loading, navigation, filters, collections, preview, menus, and dialogs. Shared preview controls retain their pending-editor contract outside the migrated command scope.

The actual-product composition proof lives in `tooling/test/e2e/extension-critical/extension-critical-gallery-library-design.spec.ts`. It checks both reference languages, themes, primary viewports, header breakpoint neighbors, and below-minimum scrolling. Component tests retain failure, pending, recovery, keyboard, and draft coverage. Screenshots and run results belong to the migration record, not this document.

## Image editor integration

The image editor adopts the shared parameter and command owners through its runtime entry. Floating panels retain their docking, resizing, canvas coordinates, tool gestures, and history contracts. Dense layer commands retain their existing dimensions. Shared start pages and color layers apply compact presentation only within the migrated context.

The native-product proof lives in `tooling/test/e2e/extension-critical/extension-critical-image-design.spec.ts`. It imports a real PNG and checks panel modes, layer editing, paint cancellation, browser headers, dimensions, commands, native export, text fitting, and layout transitions. Existing editing and persistence tests retain their separate behavioral role.

## Standalone video editor integration

The standalone video editor adopts shared parameter construction and command feedback through its application shell. Materials keep their collection-row geometry. Detached menus adopt the interface font and theme. Timeline lanes, clip handles, time mapping, preview rendering, and document fonts remain with their specialized owners. Migrated parameter stacks exclude legacy compatibility margins.

The native-product proof lives in `tooling/test/e2e/extension-critical/extension-critical-standalone-video-design.spec.ts`. It covers import, insertion, selection, commands, menus, export settings, preview controls, language, theme, and container transitions. Existing export and timeline suites retain their separate behavioral role.

## Scenario editor integration

The Scenario editor adopts shared commands and parameter construction through its viewport composition. Guide and tour controls retain their existing selection, draft, history and persistence owners. Voice Clear retains session and insertion handling. Header compression keeps its existing priority and measures complete command content.

Authored guide text uses the document font role. Interface font changes do not replace it. Exported HTML binds the document role to its bundled faces. The editor retains authored document geometry across the compact interface boundary. The tour player, embedded image editor and prepared export preview keep their isolated rendering owners.

Native composition proof lives in `tooling/test/e2e/extension-critical/extension-critical-scenario-design.spec.ts`. Existing guide, tour, image, voice, history and export suites retain their separate behavioral role.

## Settings integration

Settings adopts the interface font and shared command scope at the page owner, including its separate unlock entry. The existing row adapter uses canonical name/value construction. Sidebar and section content keep separate vertical scroll owners. The desktop viewport retains its minimum width and outer horizontal scroll path.

Form owners retain validation, drafts, Save/Cancel and pending admission. Password fields retain masking and secret handling. Native hotkey capture, context-menu reordering, collection gestures and permission requests keep their existing owners. Authored annotation previews retain their font and geometry across the interface boundary.

Native composition proof lives in `tooling/test/e2e/extension-critical/extension-critical-settings-design.spec.ts`. Existing settings, provider, permission, privacy, transfer and collection suites retain their separate behavioral role. A permission-gated native-app screen does not prove native-host integration.

## On-page content integration

Content toolbars, annotation settings, Design Review and AutoBlur adopt shared command and parameter presentation at their concrete surfaces. Owned portals retain theme and interface typography. The content bootstrap registers bundled interface faces from its trusted stylesheet. Authored page text, annotations and drawing previews retain their existing font owners.

Native composition proof lives in `extension-critical-content-design.spec.ts` and `extension-critical-content-controls-design.spec.ts` under `tooling/test/e2e/extension-critical/`. These checks cover host isolation, actual browser zoom, constrained placement, drafts, Undo, nested layers and drawing preferences. Existing focus, drawing and snapshot export suites retain gesture and authored-content proof. Recording controls remain a separate migration area.

## Integration exclusions

Preserve crop coordinates, media decoding/import, native file acquisition, recording lifecycle, device permissions, color/paint internals, persistence, and production Undo. Do not infer these engines from the bounded probes. A specimen can exercise local pending/error/recovery states without claiming native-engine parity. All ordinary reference requirements in this inventory have working examples.

Popup probes demonstrate dependencies and curtain behavior, not a replacement popup layout. The complete paint selector, timeline, canvas, and native engines remain outside this visual replacement proposal. Their existing implementations remain the reference. Product integration requires separate proof.
