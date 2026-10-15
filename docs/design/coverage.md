# Product coverage

[Design index](index.md)

[Surface-specific patterns](surfaces.md) limit generic rules for popup, timeline, canvas, and embedded UI. This bounded inventory examines the quick video inspector and recording setup. It is not a whole-application coverage claim. Existing product source remains authoritative for specialized mechanics and state ownership.

| Reachable flow | Rule owners | Reference requirement |
| --- | --- | --- |
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

## Integration exclusions

Preserve crop coordinates, media decoding/import, native file acquisition, recording lifecycle, device permissions, color/paint internals, persistence, and production Undo. Do not infer these engines from the bounded probes. A specimen can exercise local pending/error/recovery states without claiming native-engine parity. All ordinary reference requirements in this inventory have working examples.

Popup probes demonstrate dependencies and curtain behavior, not a replacement popup layout. The complete paint selector, timeline, canvas, and native engines remain outside this visual replacement proposal. Their existing implementations remain the reference. Product integration requires separate proof.
