# Inspected reference consumers

[Coverage](coverage.md) owns the bounded integration map and its exclusions.

Rules cover Collections, Selection, Buttons, Properties, Fields, Layers, Navigation, Choices, Numbers, Compositions and Specialized controls.

- [Combined inspector and browser-header examples](../../tooling/design-reference/examples/compositions/index.html): All/category presentation, URL/icon actions, proportions/resolution/Fit/Crop, full-column source/custom menus, beginning/end fades and retained branches.
- [Collection examples](../../tooling/design-reference/examples/collections/index.html): background/presentation/watermark acquisition/replacement, selected comments and inline editing.
- [Numeric examples](../../tooling/design-reference/examples/numbers/index.html): separate typed/scrub bounds for padding/radius, gain and webcam size/crop.
- Recording probes cover Tab/Screen/Camera dependencies, unavailable devices/quality/countdown/viewport, codec/resolution/FPS, microphone processing/live-test rejection and setup versus live/completion state. Preserve dependent unavailable output values.

Inspected source paths use `apps/extension/src/`:

- `gallery/video-review/{inspector,inspector-sections,scene-inspector,background-inspector,presentation-inspector}.tsx`
- `ui/watermark/inspector.tsx`
- `ui/action-audio/fields.tsx`
- `ui/presentation-join-fields.tsx`: Both editors share measured transition choices, duration, color and exact timing fields. Local adapters retain clocks, preview and history.
- `video-editor/workspace/sidebar/selection/inspection/scene-joins.tsx`: Exact clip-edge instances remain separate from future presets. Browser proof checks both primary viewports and inspector widths 359, 360, 361 and 520. It checks fonts, complete-frame preview and encoded output.
- `ui/presentation-media-fields.tsx`: Both editor bookends share fit, crop, duration, trim and sound controls. Local adapters retain acquisition, paused preview, history and disclosure preferences.
- `video-editor/workspace/sidebar/selection/inspection/scene-bookend-*.tsx`: Native recipes create ordinary linked media and fill clips. `extension-critical-video-editor-bookends.spec.ts` checks inspector widths, fonts, keyboard selection, reopen and encoded output.
- `workflows/browser-frame/settings.tsx`
- `popup/recording/video/setup/body.tsx`
- `popup/recording/video/settings/layout.tsx`
- `ui/popup-shell/inline-curtain/select.tsx`
