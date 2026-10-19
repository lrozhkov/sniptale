export const LOCAL_OWNER_MAPPINGS = [
  {
    owner: 'edge-padded-background-blur',
    productionFile: 'apps/extension/src/features/video/composition/canvas/edge-padded-blur.ts',
    allowCrossOwner: true,
    reason: 'Shared filtering serves Gallery spotlight and scene backgrounds in both editors.',
    testFiles: [
      'apps/extension/src/features/video/composition/canvas/edge-padded-blur.test.ts',
      'apps/extension/src/workflows/video-review/scene-background.test.ts',
      'apps/extension/src/workflows/video-review/render-spotlight.test.ts',
      'apps/extension/src/workflows/video-review/render-settings.test.ts',
      'apps/extension/src/features/video/project/scene/background-settings.test.ts',
      'apps/extension/src/features/video/project/scene/background.test.ts',
      'apps/extension/src/features/video/project/validation/root.test.ts',
      'apps/extension/src/video-editor/runtime/controller/shared-actions.test.ts',
      'apps/extension/src/video-editor/workspace/sidebar/selection/scene-background/fields.test.tsx',
      'apps/extension/src/video-editor/preview/stage/scene/canvas.test.tsx',
      'apps/extension/src/offscreen/project-export/renderer/background.test.ts',
      'apps/extension/src/features/video/project/library-source-removal.test.ts',
      'apps/extension/src/composition/persistence/media-library/delete-cascade.test.ts',
      'apps/extension/src/composition/persistence/projects/index.save.test.ts',
    ],
  },
  {
    owner: 'media-window-geometry',
    productionFile: 'apps/extension/src/features/video/project/window-geometry.ts',
    allowCrossOwner: true,
    reason:
      'Window geometry serves both editors, framing, crop/header rendering, source interactions and admission.',
    testFiles: [
      'apps/extension/src/features/video/project/factories/clip.test.ts',
      'apps/extension/src/features/video/project/factories/framing-presets.test.ts',
      'apps/extension/src/features/video/review/advanced/scene.test.ts',
      'apps/extension/src/video-editor/project/state/clip-property/media-padding.test.ts',
      'apps/extension/src/video-editor/project/state/clip-property/constraints.test.ts',
      'apps/extension/src/video-editor/workspace/sidebar/selection/inputs/camera-layout.test.tsx',
      'apps/extension/src/video-editor/workspace/sidebar/selection/inputs/media-crop.test.tsx',
      'apps/extension/src/features/video/project/window-geometry.test.ts',
      'apps/extension/src/features/video/project/validation/root.test.ts',
      'apps/extension/src/features/video/project/validation/clips.test.ts',
      'apps/extension/src/features/video/composition/draw/fitted-media.test.ts',
      'apps/extension/src/features/video/composition/draw/media-shadow.test.ts',
      'apps/extension/src/features/video/composition/draw/window-header.test.ts',
      'apps/extension/src/features/video/composition/draw/visual.media-source.test.ts',
      'apps/extension/src/features/video/composition/timeline/frame/actions.test.ts',
      'apps/extension/src/features/video/composition/timeline/frame/cursor.test.ts',
      'apps/extension/src/features/video/composition/motion/camera-geometry.test.ts',
      'apps/extension/src/features/video/composition/motion/project-follow.test.ts',
      'apps/extension/src/features/video/review/advanced/camera-projection-bounds.test.ts',
      'apps/extension/src/features/video/review/advanced/camera-geometry.test.ts',
      'apps/extension/src/features/video/review/advanced/scene-camera-plan.test.ts',
      'apps/extension/src/video-editor/project/state/clip-property/media-roundness.test.ts',
      'apps/extension/src/video-editor/project/state/clip-property/media-crop.test.ts',
      'apps/extension/src/video-editor/project/state/clip-property/media-shadow.test.ts',
      'apps/extension/src/video-editor/project/state/clip-timeline/split-partial.test.ts',
      'apps/extension/src/video-editor/workspace/sidebar/selection/inputs/media-frame.test.tsx',
      'apps/extension/src/composition/persistence/projects/index.save.test.ts',
    ],
  },
  {
    owner: 'montage-background-variants',
    productionFile: 'apps/extension/src/features/video/project/scene/background-settings.ts',
    allowCrossOwner: true,
    reason: 'Scene variants affect project admission, history, resources and both render adapters.',
    testFiles: [
      'apps/extension/src/features/video/project/scene/background-settings.test.ts',
      'apps/extension/src/features/video/project/library-source-removal.test.ts',
      'apps/extension/src/composition/persistence/media-library/delete-cascade.test.ts',
      'apps/extension/src/composition/persistence/media-library/delete-cascade.sources.test.ts',
      'apps/extension/src/composition/persistence/media-library/delete-cascade.scenario.test.ts',
      'apps/extension/src/features/video/project/media-usage.test.ts',
      'apps/extension/src/video-editor/project/state/actions.test.ts',
      'apps/extension/src/features/video/project/scene/background.test.ts',
      'apps/extension/src/features/video/project/scene/background-gradient.test.ts',
      'apps/extension/src/features/video/project/validation/root.test.ts',
      'apps/extension/src/features/video/project/validation/project.test.ts',
      'apps/extension/src/video-editor/runtime/controller/shared-actions.test.ts',
      'apps/extension/src/video-editor/runtime/commands/assets.test.tsx',
      'apps/extension/src/video-editor/workspace/sidebar/selection/scene-background/fields.test.tsx',
      'apps/extension/src/composition/persistence/projects/index.save.test.ts',
      'apps/extension/src/composition/persistence/media-library/dependencies.test.ts',
      'apps/extension/src/offscreen/project-export/media-loading/image.test.ts',
    ],
  },
  {
    owner: 'camera-source-geometry',
    productionFile:
      'apps/extension/src/features/video/composition/motion/camera-source-geometry.ts',
    reason: 'Animated camera source bounds feed cursor rendering and continuous follow admission.',
    testFiles: [
      'apps/extension/src/features/video/composition/motion/camera-source-geometry.test.ts',
      'apps/extension/src/features/video/composition/motion/camera-geometry.test.ts',
      'apps/extension/src/features/video/composition/motion/project-follow.test.ts',
      'apps/extension/src/features/video/composition/timeline/frame/cursor.test.ts',
    ],
  },
  {
    owner: 'media-source-crop',
    productionFile: 'apps/extension/src/features/video/project/media-crop.ts',
    allowCrossOwner: true,
    reason:
      'Source crop feeds both editors, Montage schema, geometry, source interactions, commands and inspector.',
    testFiles: [
      'apps/extension/src/features/video/project/media-crop.test.ts',
      'apps/extension/src/features/video/project/validation/root.test.ts',
      'apps/extension/src/features/video/project/validation/clips.test.ts',
      'apps/extension/src/features/video/composition/draw/fitted-media.test.ts',
      'apps/extension/src/features/video/composition/draw/window-header.test.ts',
      'apps/extension/src/features/video/composition/draw/visual.media-source.test.ts',
      'apps/extension/src/features/video/composition/timeline/frame/actions.test.ts',
      'apps/extension/src/features/video/composition/timeline/frame/cursor.test.ts',
      'apps/extension/src/features/video/composition/motion/project-follow.test.ts',
      'apps/extension/src/features/video/composition/motion/camera-geometry.test.ts',
      'apps/extension/src/video-editor/project/state/clip-property/media-crop.test.ts',
      'apps/extension/src/video-editor/project/state/clip-timeline/split-partial.test.ts',
      'apps/extension/src/video-editor/workspace/sidebar/selection/inputs/media-crop.test.tsx',
      'apps/extension/src/video-editor/workspace/sidebar/selection/inputs/media-crop-preview.test.tsx',
      'apps/extension/src/features/video/review/advanced/canvas.test.ts',
      'apps/extension/src/features/video/review/advanced/scene.test.ts',
      'apps/extension/src/features/video/review/advanced/scene-camera-plan.test.ts',
      'apps/extension/src/gallery/video-review/stage-geometry.test.tsx',
      'apps/extension/src/gallery/video-review/source-crop-editor.test.tsx',
      'apps/extension/src/workflows/video-review/render-settings.test.ts',
    ],
  },
  {
    owner: 'camera-source-visibility',
    productionFile: 'apps/extension/src/features/video/project/camera/visibility.ts',
    allowCrossOwner: true,
    reason:
      'Source visibility affects both editor boundaries, camera commands, composition and inspector edits.',
    testFiles: [
      'apps/extension/src/features/video/project/validation/root.test.ts',
      'apps/extension/src/features/video/project/validation/clips.test.ts',
      'apps/extension/src/features/video/project/validation/project.test.ts',
      'apps/extension/src/features/video/project/camera/appearance.test.ts',
      'apps/extension/src/features/video/project/camera/animation.test.ts',
      'apps/extension/src/features/video/composition/draw/camera-appearance.test.ts',
      'apps/extension/src/features/video/composition/draw/visual.media-source.test.ts',
      'apps/extension/src/features/video/composition/draw/fitted-media.test.ts',
      'apps/extension/src/features/video/composition/draw/window-header.test.ts',
      'apps/extension/src/video-editor/workspace/sidebar/selection/inputs/camera-appearance.test.tsx',
      'apps/extension/src/video-editor/workspace/sidebar/selection/inputs/camera-crop-preview.test.tsx',
      'apps/extension/src/video-editor/project/state/clip-timeline/split-partial.test.ts',
      'apps/extension/src/features/video/project/timeline/track-audio.test.ts',
      'apps/extension/src/features/video/review/advanced/webcam.test.ts',
      'apps/extension/src/workflows/video-review/render-webcam.test.ts',
      'apps/extension/src/video-editor/preview/stage/point-overlay/index.test.tsx',
      'apps/extension/src/features/video/composition/timeline/frame/actions.test.ts',
      'apps/extension/src/features/video/project/effect-instance/apply-targets.test.ts',
      'apps/extension/src/video-editor/preview/stage/runtime/camera-transform.test.ts',
      'apps/extension/src/video-editor/project/state/clip-property/media-shadow.test.ts',
      'apps/extension/src/video-editor/project/state/clip-property/media-crop.test.ts',
      'apps/extension/src/features/video/project/camera/visibility.test.ts',
      'apps/extension/src/video-editor/workspace/sidebar/selection/inputs/camera-visibility.test.tsx',
      'apps/extension/src/video-editor/workspace/sidebar/selection/inspection/clip.test.tsx',
    ],
  },
  {
    owner: 'montage-camera-source-trajectory',
    productionFile: 'apps/extension/src/features/video/project/camera/animation.ts',
    allowCrossOwner: true,
    reason:
      'Camera trajectories and source crops share evaluation with inverse canvas edits and media commands.',
    testFiles: [
      'apps/extension/src/features/video/project/camera/animation.test.ts',
      'apps/extension/src/features/video/project/camera/appearance.test.ts',
      'apps/extension/src/features/video/composition/timeline/frame/actions.test.ts',
      'apps/extension/src/video-editor/project/state/clip-timeline/split-partial.test.ts',
      'apps/extension/src/video-editor/preview/stage/runtime/camera-transform.test.ts',
      'apps/extension/src/video-editor/project/state/clip-property/media-shadow.test.ts',
    ],
  },
  {
    owner: 'montage-media-shadow-color',
    productionFile: 'apps/extension/src/video-editor/project/state/clip-property/media.ts',
    allowCrossOwner: true,
    reason:
      'Media shadow commands affect schema admission, track copies, shared rendering and inspector routing.',
    testFiles: [
      'apps/extension/src/features/video/project/validation/root.test.ts',
      'apps/extension/src/features/video/project/validation/clips.test.ts',
      'apps/extension/src/features/video/project/hydration/clip.test.ts',
      'apps/extension/src/features/video/composition/draw/camera-appearance.test.ts',
      'apps/extension/src/features/video/composition/draw/visual.media-source.test.ts',
      'apps/extension/src/features/video/composition/draw/window-header.test.ts',
      'apps/extension/src/video-editor/project/state/clip-property/media-shadow.test.ts',
      'apps/extension/src/video-editor/project/state/clip-timeline/split-partial.test.ts',
      'apps/extension/src/video-editor/workspace/sidebar/selection/inputs/media-frame.test.tsx',
      'apps/extension/src/video-editor/project/state/actions.test.ts',
      'apps/extension/src/video-editor/runtime/controller/store.test.tsx',
      'apps/extension/src/video-editor/workspace/surface/sidebar-props.test.ts',
      'apps/extension/src/features/video/review/advanced/webcam.test.ts',
      'apps/extension/src/workflows/video-review/render-webcam.test.ts',
    ],
  },
  {
    owner: 'montage-camera-pixel-orientation',
    productionFile: 'apps/extension/src/features/video/project/camera/editing.ts',
    allowCrossOwner: true,
    reason:
      'Camera commands affect schema admission, clip copies, source pixels and inspector crops.',
    testFiles: [
      'apps/extension/src/features/video/project/validation/root.test.ts',
      'apps/extension/src/features/video/project/validation/clips.test.ts',
      'apps/extension/src/features/video/project/validation/project.test.ts',
      'apps/extension/src/features/video/project/camera/appearance.test.ts',
      'apps/extension/src/features/video/project/effect-instance/apply-targets.test.ts',
      'apps/extension/src/features/video/project/camera/animation.test.ts',
      'apps/extension/src/features/video/composition/draw/camera-appearance.test.ts',
      'apps/extension/src/features/video/composition/draw/visual.media-source.test.ts',
      'apps/extension/src/features/video/composition/draw/fitted-media.test.ts',
      'apps/extension/src/features/video/composition/timeline/frame/actions.test.ts',
      'apps/extension/src/video-editor/preview/stage/point-overlay/index.test.tsx',
      'apps/extension/src/features/video/composition/draw/window-header.test.ts',
      'apps/extension/src/video-editor/workspace/sidebar/selection/inputs/camera-appearance.test.tsx',
      'apps/extension/src/video-editor/workspace/sidebar/selection/inputs/camera-crop-preview.test.tsx',
      'apps/extension/src/video-editor/project/state/clip-timeline/split-partial.test.ts',
      'apps/extension/src/features/video/project/timeline/track-audio.test.ts',
      'apps/extension/src/features/video/review/advanced/webcam.test.ts',
      'apps/extension/src/workflows/video-review/render-webcam.test.ts',
    ],
  },
  {
    owner: 'shared-video-audio-fades',
    productionFile: 'apps/extension/src/features/video/audio/fades.ts',
    allowCrossOwner: true,
    reason: 'Fade geometry and limits affect Gallery and Montage authoring, preview and export.',
    testFiles: [
      'apps/extension/src/features/video/audio/fades.test.ts',
      'apps/extension/src/features/video/review/advanced/audio.test.ts',
      'apps/extension/src/features/video/review/advanced/audio-plan.test.ts',
      'apps/extension/src/features/video/review/advanced/advanced-state.test.ts',
      'apps/extension/src/features/video/project/timeline/presentation.test.ts',
      'apps/extension/src/gallery/video-review/audio-editor.test.tsx',
      'apps/extension/src/video-editor/project/state/clip-property/timing.test.ts',
      'apps/extension/src/video-editor/workspace/sidebar/selection/inputs/clip-timing.test.tsx',
      'apps/extension/src/video-editor/workspace/sidebar/selection/inputs/timing-fields.test.tsx',
      'apps/extension/src/offscreen/project-export/offline-audio/clip-audio/collect.test.ts',
      'apps/extension/src/offscreen/project-export/offline-audio/mix/schedule.test.ts',
      'apps/extension/src/workflows/video-review/audio-render.test.ts',
    ],
  },

  {
    owner: 'montage-audio-track-master',
    productionFile: 'apps/extension/src/features/video/project/timeline/track-audio.ts',
    allowCrossOwner: true,
    reason:
      'Track masters affect admission, hydration, preview, scene response, export and mounted history.',
    testFiles: [
      'apps/extension/src/features/video/project/timeline/track-audio.test.ts',
      'apps/extension/src/features/video/project/validation/tracks.test.ts',
      'apps/extension/src/features/video/project/validation/root.test.ts',
      'apps/extension/src/features/video/project/mutation.test.ts',
      'apps/extension/src/features/video/project/scene/background-audio.test.ts',
      'apps/extension/src/features/video/project/timeline/original-audio.test.ts',
      'apps/extension/src/offscreen/project-export/offline-audio/clip-audio/collect.test.ts',
      'apps/extension/src/offscreen/project-export/offline-audio/mix/schedule.test.ts',
      'apps/extension/src/video-editor/preview/stage/runtime/audio.test.tsx',
      'apps/extension/src/video-editor/preview/stage/runtime/playback/audio-graph.test.ts',
      'apps/extension/src/video-editor/workspace/sidebar/selection/track/sections.test.tsx',
      'apps/extension/src/video-editor/project/state/clip-timeline/split-text.test.ts',
    ],
  },
  {
    owner: 'montage-original-audio-authoring-consumers',
    productionFile: 'apps/extension/src/features/video/project/timeline/original-audio.ts',
    reason:
      'Original audio identities and track gates affect authoring, preview, export and source editing.',
    testFiles: [
      'apps/extension/src/features/video/project/timeline/original-audio.test.ts',
      'apps/extension/src/features/video/project/text/authoring.test.ts',
      'apps/extension/src/features/video/project/timeline/presentation.test.ts',
      'apps/extension/src/features/video/project/scene/background-audio.test.ts',
      'apps/extension/src/features/video/project/timeline/overwrite.helpers.test.ts',
      'apps/extension/src/offscreen/project-export/offline-audio/clip-audio/collect.test.ts',
      'apps/extension/src/offscreen/project-export/offline-audio/mix/schedule.test.ts',
      'apps/extension/src/video-editor/project/state/clip-timeline/split-text.test.ts',
    ],
  },
  {
    owner: 'montage-original-audio-placement-controls',
    productionFile:
      'apps/extension/src/video-editor/workspace/sidebar/selection/inspection/text-voice.tsx',
    reason: 'The speech panel composes original source selection with mounted placement and Apply.',
    testFiles: [
      'apps/extension/src/video-editor/workspace/sidebar/selection/inputs/original-audio.test.tsx',
      'apps/extension/src/video-editor/runtime/session/text-voice.test.tsx',
    ],
  },
  {
    owner: 'source-audio-attenuation-consumers',
    productionFile: 'apps/extension/src/features/video/audio/source-attenuation.ts',
    reason: 'The shared interval policy must preserve Gallery projection, rendering and export.',
    testFiles: [
      'apps/extension/src/features/video/audio/source-attenuation.test.ts',
      'apps/extension/src/features/video/review/advanced/original-audio-mutes.test.ts',
      'apps/extension/src/features/video/review/advanced/effective.test.ts',
      'apps/extension/src/workflows/video-review/audio-render.test.ts',
      'apps/extension/src/workflows/video-review/export-lifecycle-audio.test.ts',
    ],
  },
  {
    owner: 'montage-composite-audio-consumers',
    allowCrossOwner: true,
    productionFile: 'apps/extension/src/features/video/project/timeline/presentation.gain.ts',
    reason:
      'Canonical gain drives preview, scene response, offline mixing and realtime export after unchanged project admission.',
    testFiles: [
      'apps/extension/src/features/video/project/timeline/audio.test.ts',
      'apps/extension/src/features/video/project/timeline/track-audio.test.ts',
      'apps/extension/src/features/video/project/hydration/clip.test.ts',
      'apps/extension/src/features/video/project/hydration/index.test.ts',
      'apps/extension/src/composition/persistence/project-export-inputs/index.test.ts',
      'apps/extension/src/offscreen/project-export/offline-audio/clip-audio/collect.test.ts',
      'apps/extension/src/offscreen/project-export/offline-audio/mix/schedule.test.ts',
      'apps/extension/src/offscreen/project-export/media-playback/playback.test.ts',
      'apps/extension/src/video-editor/preview/stage/runtime/audio.test.tsx',
      'apps/extension/src/features/video/project/timeline/original-audio.test.ts',
      'apps/extension/src/features/video/project/timeline/presentation.test.ts',
      'apps/extension/src/features/video/project/timeline/presentation.transitions.test.ts',
      'apps/extension/src/features/video/project/scene/background-audio.test.ts',
    ],
  },
  {
    owner: 'preference-initialization-consumer',
    productionFile:
      'apps/extension/src/composition/persistence/infrastructure/preference-service/browser-io.ts',
    allowCrossOwner: true,
    reason:
      'Locale initialization proves conditional writes, failure, and ordering with user choices and erasure.',
    testFiles: [
      'apps/extension/src/composition/persistence/infrastructure/preference-service/accessors.test.ts',
      'apps/extension/src/composition/persistence/infrastructure/preference-service/helpers.test.ts',
      'apps/extension/src/composition/persistence/infrastructure/preference-service/index.test.ts',
      'apps/extension/src/platform/i18n/locale/initialization.test.ts',
    ],
  },
  {
    owner: 'video-review-local-session-reset',
    productionFile: 'apps/extension/src/workflows/video-review/local-session.ts',
    reason: 'Local reset candidates use session reset, queue, history and snapshot CAS proof.',
    testFiles: [
      'apps/extension/src/workflows/video-review/local-session.test.ts',
      'apps/extension/src/workflows/video-review/session.reset.test.ts',
      'apps/extension/src/workflows/video-review/session.test.ts',
      'apps/extension/src/workflows/video-review/session.history-start.test.ts',
      'apps/extension/src/composition/persistence/review-workspaces/store.test.ts',
    ],
  },
  {
    owner: 'shared-paint-selector-trigger',
    productionFile: 'apps/extension/src/ui/paint-selector/trigger.tsx',
    reason:
      'Trigger variants, expansion, cancellation and focus restoration use the selector integration suite.',
    testFiles: ['apps/extension/src/ui/paint-selector/index.test.tsx'],
  },
  {
    owner: 'cursor-timeline-consumers',
    productionFile: 'apps/extension/src/features/video/project/cursor-focus-path/timeline.ts',
    reason:
      'Shared cursor controls and the standalone timeline prove picking and projected navigation.',
    testFiles: [
      'apps/extension/src/ui/cursor-focus-timeline-keys.test.tsx',
      'apps/extension/src/video-editor/timeline/project/effect-lanes/cursor-focus-keys.test.tsx',
    ],
  },
  {
    owner: 'review-audio-runtime-consumers',
    productionFile: 'apps/extension/src/gallery/video-review/use-review-audio-runtime.ts',
    reason:
      'Playback preparation and queued audio lifetime use both runtime and action-audio suites.',
    testFiles: [
      'apps/extension/src/gallery/video-review/use-review-audio-runtime.test.tsx',
      'apps/extension/src/gallery/video-review/use-review-action-audio-runtime.test.tsx',
    ],
  },
  {
    owner: 'project-cursor-focus-consumers',
    productionFile: 'apps/extension/src/features/video/project/cursor-focus-path/projection.ts',
    reason:
      'Existing handoff and editor suites prove source projection, anchors and retained edits.',
    testFiles: [
      'apps/extension/src/features/video/review/standalone-interactions.test.ts',
      'apps/extension/src/video-editor/project/state/effects.cursor.test.ts',
    ],
  },
  {
    owner: 'review-cursor-focus-consumers',
    productionFile: 'apps/extension/src/features/video/review/advanced/cursor-focus-path.ts',
    reason:
      'Handoff and camera suites prove retained anchors, cropped observations and continuity.',
    testFiles: [
      'apps/extension/src/features/video/review/standalone-interactions.test.ts',
      'apps/extension/src/features/video/review/advanced/scene-camera-plan.test.ts',
    ],
  },
  {
    owner: 'review-scene-camera-consumers',
    productionFile: 'apps/extension/src/features/video/review/advanced/scene.ts',
    reason: 'Camera-plan consumers prove output fitting and link-gap rejection.',
    testFiles: ['apps/extension/src/features/video/review/advanced/scene-camera-plan.test.ts'],
  },
  {
    owner: 'review-project-concurrency',
    productionFile:
      'apps/extension/src/composition/persistence/review-workspaces/project-commands.ts',
    reason: 'Real writer tests prevent deleted content from returning after purge and recreation.',
    testFiles: [
      'apps/extension/src/composition/persistence/review-workspaces/store.test.ts',
      'apps/extension/src/workflows/video-review/session.project-purge.test.ts',
      'apps/extension/src/gallery/video-review/use-session.purge.test.tsx',
    ],
  },
  {
    owner: 'review-workspace-concurrency',
    productionFile: 'apps/extension/src/composition/persistence/review-workspaces/store.ts',
    reason: 'Real writer tests prevent deleted content from returning after purge and recreation.',
    testFiles: [
      'apps/extension/src/workflows/video-review/session.project-purge.test.ts',
      'apps/extension/src/gallery/video-review/use-session.purge.test.tsx',
    ],
  },
  {
    owner: 'asset-reader-concurrency',
    productionFile: 'apps/extension/src/composition/persistence/assets/resource-sessions.ts',
    reason: 'Real writer tests prevent deleted content from returning after purge and recreation.',
    testFiles: [
      'apps/extension/src/workflows/video-review/session.project-purge.test.ts',
      'apps/extension/src/gallery/video-review/use-session.purge.test.tsx',
    ],
  },
  {
    owner: 'review-session-concurrency',
    productionFile: 'apps/extension/src/workflows/video-review/session.ts',
    reason: 'Real writer tests prevent deleted content from returning after purge and recreation.',
    testFiles: ['apps/extension/src/workflows/video-review/session.project-purge.test.ts'],
  },
  {
    owner: 'review-loading-concurrency',
    productionFile: 'apps/extension/src/gallery/video-review/use-session.ts',
    reason: 'Real writer tests prevent deleted content from returning after purge and recreation.',
    testFiles: [
      'apps/extension/src/gallery/video-review/use-session.purge.test.tsx',
      'apps/extension/src/gallery/video-review/use-session.loaded.test.tsx',
      'apps/extension/src/gallery/video-review/use-session.resources.test.tsx',
    ],
  },
  {
    owner: 'background-review-audio-authorization',
    productionFile: 'apps/extension/src/background/ai/audio/authorization.ts',
    reason: `Sender, durable source selection, native ranges and transcript scope are checked by
      the authorization and provider request consumer suites.`,
    testFiles: [
      'apps/extension/src/background/ai/audio/authorization.test.ts',
      'apps/extension/src/background/ai/audio/authorization.source.test.ts',
      'apps/extension/src/background/ai/audio/chat-transcription.test.ts',
      'apps/extension/src/background/ai/audio/model-config.test.ts',
    ],
  },
  {
    owner: 'indexed-db-usage-index-estimation',
    productionFile:
      'apps/extension/src/composition/persistence/infrastructure/indexed-db/usage-index-migration.ts',
    reason: `The schema admission and usage-index upgrade suites execute estimation through the
      registered migration, including source failure and alias cursor validation.`,
    testFiles: [
      'apps/extension/src/composition/persistence/infrastructure/indexed-db/schema-contracts.test.ts',
      'apps/extension/src/composition/persistence/infrastructure/indexed-db/upgrade/usage-index.test.ts',
    ],
  },
  {
    owner: 'video-review-session-durable-access',
    productionFile: 'apps/extension/src/workflows/video-review/session-durable-access.ts',
    reason: `The session suites exercise source/revision CAS, autosave, reset, retained history,
      speech receipts and annotation acquisition through the owning session.`,
    testFiles: [
      'apps/extension/src/workflows/video-review/session.project-purge.test.ts',
      'apps/extension/src/workflows/video-review/session.test.ts',
      'apps/extension/src/workflows/video-review/session.autosave.test.ts',
      'apps/extension/src/workflows/video-review/session.reset.test.ts',
      'apps/extension/src/workflows/video-review/session.history-start.test.ts',
      'apps/extension/src/workflows/video-review/local-session.test.ts',
      'apps/extension/src/workflows/video-review/speech-publication.test.ts',
      'apps/extension/src/workflows/video-review/speech-publication-state.test.ts',
      'apps/extension/src/workflows/video-review/annotation-acquisition.test.ts',
    ],
  },
  {
    owner: 'video-review-session-private-contracts',
    productionFile: 'apps/extension/src/workflows/video-review/session-types.ts',
    reason: `Private session state and persistence contracts are consumed by the session and
      durable-access suites; this module has no independent runtime.`,
    testFiles: [
      'apps/extension/src/workflows/video-review/session.test.ts',
      'apps/extension/src/workflows/video-review/session.autosave.test.ts',
      'apps/extension/src/workflows/video-review/session.reset.test.ts',
      'apps/extension/src/workflows/video-review/session.history-start.test.ts',
      'apps/extension/src/workflows/video-review/local-session.test.ts',
      'apps/extension/src/workflows/video-review/speech-publication.test.ts',
      'apps/extension/src/workflows/video-review/speech-publication-state.test.ts',
      'apps/extension/src/workflows/video-review/annotation-acquisition.test.ts',
    ],
  },
  {
    owner: 'scenario-content-capture-transport',
    productionFile: 'apps/extension/src/content/overlay/scenario/runtime/transport/capture.ts',
    reason: 'The transport suite executes capture messaging and its content intent boundary.',
    testFiles: ['apps/extension/src/content/overlay/scenario/runtime/transport.test.ts'],
  },
  {
    owner: 'scenario-content-step-transport',
    productionFile: 'apps/extension/src/content/overlay/scenario/runtime/transport/steps.ts',
    reason: 'The transport suite executes save, delete and move message contracts.',
    testFiles: ['apps/extension/src/content/overlay/scenario/runtime/transport.test.ts'],
  },
  {
    owner: 'video-editor-playback-shortcuts',
    productionFile: 'apps/extension/src/video-editor/runtime/session/playback/shortcuts.ts',
    reason: 'Shortcut suites cover effect deletion and the complete keyboard routing surface.',
    testFiles: [
      'apps/extension/src/video-editor/runtime/session/playback.effect-instance-delete.test.tsx',
      'apps/extension/src/video-editor/runtime/session/playback.space-intercept.test.tsx',
    ],
  },
  {
    owner: 'settings-transfer-workflow',
    productionPrefix: 'apps/extension/src/workflows/settings-transfer/',
    exclusive: true,
    reason:
      'Settings transfer behavior is exercised by its owner-local package and registry suites.',
    testFiles: [
      'apps/extension/src/workflows/settings-transfer/planner.test.ts',
      'apps/extension/src/workflows/settings-transfer/registry.test.ts',
      'apps/extension/src/workflows/settings-transfer/selection.test.ts',
      'apps/extension/src/workflows/settings-transfer/settings-coverage.test.ts',
    ],
  },
  {
    owner: 'background-service-worker-entrypoint',
    productionFile: 'apps/extension/src/background/index.ts',
    reason: 'The service-worker entrypoint is exercised by its bounded runtime bootstrap suite.',
    testFiles: ['apps/extension/src/background/runtime/bootstrap/index.test.ts'],
  },
  {
    owner: 'offscreen-document-entrypoint',
    productionFile: 'apps/extension/src/offscreen/offscreen.ts',
    reason: 'The offscreen entrypoint is exercised by its bounded runtime entrypoint suite.',
    testFiles: ['apps/extension/src/offscreen/runtime/entrypoint.test.ts'],
  },
  {
    owner: 'ai-secret-unlock-request-store',
    productionFile:
      'apps/extension/src/composition/persistence/ai-settings/secret-unlock-requests.store.ts',
    exclusive: true,
    allowCrossOwner: true,
    reason: 'Secret-unlock records require storage lifecycle and protected-provider route proof.',
    testFiles: [
      'apps/extension/src/composition/persistence/ai-settings/secret-unlock-requests.store.test.ts',
      'apps/extension/src/background/ai/settings/secret-unlock-route.review-text.test.ts',
    ],
  },
  {
    owner: 'ai-secret-unlock-request-parser',
    productionFile:
      'apps/extension/src/composition/persistence/ai-settings/secret-unlock-requests.parser.ts',
    exclusive: true,
    allowCrossOwner: true,
    reason:
      'Secret-unlock admission requires storage lifecycle and protected-provider route proof.',
    testFiles: [
      'apps/extension/src/composition/persistence/ai-settings/secret-unlock-requests.store.test.ts',
      'apps/extension/src/background/ai/settings/secret-unlock-route.review-text.test.ts',
    ],
  },
  {
    owner: 'indexed-db-core',
    productionFile: 'apps/extension/src/composition/persistence/infrastructure/indexed-db/core.ts',
    exclusive: true,
    reason: 'IndexedDB schema and upgrade authority are exercised by the owner-local core suite.',
    testFiles: [
      'apps/extension/src/composition/persistence/infrastructure/indexed-db/core.test.ts',
      'apps/extension/src/composition/persistence/infrastructure/indexed-db/core.lock.test.ts',
      'apps/extension/src/composition/persistence/infrastructure/indexed-db/core.recovery.test.ts',
    ],
  },
  {
    owner: 'media-hub-references',
    productionFile: 'apps/extension/src/features/media-hub/references.ts',
    exclusive: true,
    reason: 'Media reference projection is exercised by its owner-local mixed-source suite.',
    testFiles: ['apps/extension/src/features/media-hub/references.test.ts'],
  },
  {
    owner: 'extension-editor-navigation',
    productionFile: 'apps/extension/src/platform/navigation/extension-pages/editor.ts',
    exclusive: true,
    reason: 'Canonical editor URL construction is exercised by the owner-local URL suite.',
    testFiles: ['apps/extension/src/platform/navigation/extension-pages/editor.test.ts'],
  },
  {
    owner: 'scenario-persistence-contracts',
    productionFile: 'apps/extension/src/composition/persistence/scenario/contracts.ts',
    allowCrossOwner: true,
    reason:
      'Scenario persistence record contracts are exercised through the project read-guard boundary suite.',
    testFiles: ['apps/extension/src/composition/persistence/projects/index.read-guards.test.ts'],
  },
  {
    owner: 'scenario-persistence-read-guards',
    productionFile: 'apps/extension/src/composition/persistence/scenario/read-guards.ts',
    allowCrossOwner: true,
    reason:
      'Scenario record parsers are exercised by the project persistence read-guard boundary suite.',
    testFiles: ['apps/extension/src/composition/persistence/projects/index.read-guards.test.ts'],
  },
  {
    owner: 'editor-bootstrap-contract',
    productionFile: 'apps/extension/src/features/editor/contracts/bootstrap.ts',
    allowCrossOwner: true,
    reason:
      'The editor bootstrap contract is exercised through the workflow owner that consumes and assembles it.',
    testFiles: ['apps/extension/src/workflows/editor/bootstrap/index.test.ts'],
  },
  {
    owner: 'highlighter-auto-blur-contract',
    productionFile: 'apps/extension/src/features/highlighter/contracts/auto-blur.ts',
    reason:
      'Auto-blur category order and contract constants are exercised by storage parsing and selection behavior suites.',
    testFiles: [
      'apps/extension/src/content/overlay/auto-blur/persistence/index.test.ts',
      'apps/extension/src/content/selection/auto-blur-runtime/match-selection.test.ts',
    ],
  },
  {
    owner: 'content-auto-blur-controller',
    productionPrefix: 'apps/extension/src/content/overlay/auto-blur/controller/',
    exclusive: true,
    reason:
      'Auto-blur session transitions, effects, and workflows have one owner-level behavior suite.',
    testFiles: ['apps/extension/src/content/overlay/auto-blur/controller/index.test.tsx'],
  },
  {
    owner: 'content-ai-pick-submit-feedback-predecessor',
    productionFile: 'apps/extension/src/content/overlay/ai/pick/controller/submit/feedback.ts',
    exclusive: true,
    allowMissingProductionTarget: true,
    reason: 'The apply transaction covers the removed feedback leaf and its visible outcomes.',
    testFiles: ['apps/extension/src/content/overlay/ai/pick/controller/submit/apply.test.ts'],
  },
  {
    owner: 'content-ai-pick-submit-types-predecessor',
    productionFile: 'apps/extension/src/content/overlay/ai/pick/controller/submit/types.ts',
    exclusive: true,
    allowMissingProductionTarget: true,
    reason:
      'The removed local type bag is covered by the narrowed apply, submit, and request owner contracts.',
    testFiles: [
      'apps/extension/src/content/overlay/ai/pick/controller/submit/apply.test.ts',
      'apps/extension/src/content/overlay/ai/pick/controller/submit/index.test.ts',
      'apps/extension/src/content/overlay/ai/pick/controller/submit/request.test.ts',
    ],
  },
  {
    owner: 'content-design-review-popover',
    productionPrefix: 'apps/extension/src/content/overlay/design-review/popover/',
    exclusive: true,
    reason: 'Direct proof covers review controls, settings, autosave, and the closed popover.',
    testFiles: [
      'apps/extension/src/content/overlay/design-review/popover/comment.test.tsx',
      'apps/extension/src/content/overlay/design-review/popover/view.test.tsx',
    ],
  },
  {
    owner: 'content-design-review-feedback-controls',
    productionFile: 'apps/extension/src/content/overlay/design-review/feedback-panel/controls.tsx',
    exclusive: true,
    reason:
      'The feedback-panel surface suite proves search and filter controls in their rendered owner composition.',
    testFiles: ['apps/extension/src/content/overlay/design-review/feedback-panel/view.test.tsx'],
  },
  {
    owner: 'content-design-review-feedback-list',
    productionFile: 'apps/extension/src/content/overlay/design-review/feedback-panel/list.tsx',
    exclusive: true,
    reason:
      'The feedback-panel surface suite proves list, preview, summary, and empty-result states.',
    testFiles: ['apps/extension/src/content/overlay/design-review/feedback-panel/view.test.tsx'],
  },
  {
    owner: 'content-design-review-appearance',
    productionFile:
      'apps/extension/src/content/overlay/design-review/settings/sections/appearance.tsx',
    exclusive: true,
    reason:
      'The direct appearance suite proves color and shadow remain while asset and gradient inputs are retired.',
    testFiles: [
      'apps/extension/src/content/overlay/design-review/settings/appearance-fields.test.tsx',
    ],
  },
  {
    owner: 'content-design-review-layout-settings',
    productionFile: 'apps/extension/src/content/overlay/design-review/settings/sections/frame.tsx',
    exclusive: true,
    reason: 'The settings suite covers localized size, spacing, width, and height controls.',
    testFiles: ['apps/extension/src/content/overlay/design-review/settings/view.test.tsx'],
  },
  {
    owner: 'content-design-review-text-settings',
    productionFile: 'apps/extension/src/content/overlay/design-review/settings/sections/text.tsx',
    exclusive: true,
    reason: 'The settings suite covers default text controls and selected-section replacement.',
    testFiles: ['apps/extension/src/content/overlay/design-review/settings/view.test.tsx'],
  },
  {
    owner: 'content-design-review-view-contract',
    productionFile: 'apps/extension/src/content/overlay/design-review/types.ts',
    exclusive: true,
    reason: 'Popover and settings suites cover the shared review action and view-state contract.',
    testFiles: [
      'apps/extension/src/content/overlay/design-review/popover/view.test.tsx',
      'apps/extension/src/content/overlay/design-review/settings/view.test.tsx',
    ],
  },
  {
    owner: 'content-design-review-surface',
    productionFile: 'apps/extension/src/content/overlay/design-review/view.tsx',
    exclusive: true,
    reason:
      'The surface suite proves the extension-owned composition retains both review markers and the active popover.',
    testFiles: ['apps/extension/src/content/overlay/design-review/view.test.tsx'],
  },
  {
    owner: 'content-design-review-record',
    productionFile: 'apps/extension/src/content/overlay/design-review/runtime/record.ts',
    exclusive: true,
    reason:
      'The record suite covers metadata, serialization, deletion, rollback, and history restore.',
    testFiles: ['apps/extension/src/content/overlay/design-review/runtime/comment.test.ts'],
  },
  {
    owner: 'content-design-review-picker',
    productionFile: 'apps/extension/src/content/selection/design-review/picker.ts',
    exclusive: true,
    reason:
      'The picker suite covers shadow and iframe selection, fallback, and extension-UI exclusion.',
    testFiles: ['apps/extension/src/content/selection/design-review/picker.test.ts'],
  },
  {
    owner: 'content-design-review-mode',
    productionFile: 'apps/extension/src/content/selection/design-review/mode.ts',
    exclusive: true,
    reason: 'The mode suite covers activation, sibling exclusion, selection, and deactivation.',
    testFiles: ['apps/extension/src/content/selection/design-review/mode.test.ts'],
  },
  {
    owner: 'content-design-review-frame',
    productionFile: 'apps/extension/src/content/selection/design-review/frame.ts',
    exclusive: true,
    reason:
      'The frame suite proves exact absolute geometry and the frozen two-pixel black outline.',
    testFiles: ['apps/extension/src/content/selection/design-review/frame.test.ts'],
  },
  {
    owner: 'content-runtime-bridge-types',
    productionFile: 'apps/extension/src/content/runtime/bridge/types.ts',
    exclusive: true,
    reason:
      'Core and router suites prove surviving message families and no page-style handler slot.',
    testFiles: [
      'apps/extension/src/content/runtime/bridge/core.test.ts',
      'apps/extension/src/content/runtime/bridge/router.test.ts',
    ],
  },
  {
    owner: 'content-overlay-app-layout-projection',
    productionFile: 'apps/extension/src/content/overlay/app-layout/props.ts',
    exclusive: true,
    reason: 'The app composition covers scenario, toolbar, and dialog layout projection.',
    testFiles: ['apps/extension/src/content/overlay/app/view/index.test.tsx'],
  },
  {
    owner: 'content-app-mode-flags',
    productionFile: 'apps/extension/src/content/overlay/app/content-mode/state/flags.ts',
    exclusive: true,
    reason: 'The content-mode hook covers grouped flags and standalone Design Review state.',
    testFiles: ['apps/extension/src/content/overlay/app/content-mode/index.test.tsx'],
  },
  {
    owner: 'content-toolbar-view-model',
    productionFile: 'apps/extension/src/content/overlay/toolbar/state/view-model.ts',
    exclusive: true,
    reason:
      'The direct hook suite proves Design Review mode and capture actions retain their narrowed role contracts.',
    testFiles: ['apps/extension/src/content/overlay/toolbar/state/view-model.test.tsx'],
  },
  {
    owner: 'content-overlay-scenario-controller',
    productionFile: 'apps/extension/src/content/overlay/scenario/controller.ts',
    exclusive: true,
    reason: 'The orchestration suite covers scenario state, runtime, view state, and effects.',
    testFiles: ['apps/extension/src/content/overlay/scenario/controller.test.tsx'],
  },
  {
    owner: 'content-overlay-toolbar-capture-menus',
    productionFile: 'apps/extension/src/content/overlay/toolbar/capture/menus.tsx',
    exclusive: true,
    reason:
      'Toolbar capture menu visibility and exact dropdown/viewport composition execute through its direct owner suite.',
    testFiles: ['apps/extension/src/content/overlay/toolbar/capture/menus.test.tsx'],
  },
  {
    owner: 'content-overlay-toolbar-viewport-mutation',
    productionFile: 'apps/extension/src/content/overlay/toolbar/view.tsx',
    exclusive: true,
    reason:
      'Toolbar viewport changes use the shared owner and its injected viewer-local mutation port.',
    testFiles: [
      'apps/extension/src/content/overlay/toolbar/shell/viewport-change.test.ts',
      'apps/extension/src/content/overlay/toolbar/shell/view.test.tsx',
    ],
  },
  {
    owner: 'popup-export-page-content',
    productionFile: 'apps/extension/src/popup/shell/export/pages/content.tsx',
    reason:
      'Popup export page content switches between grouped session transfer state and ready selection props.',
    testFiles: ['apps/extension/src/popup/shell/export/pages/content.test.tsx'],
  },
  {
    owner: 'content-area-selection-controller',
    productionFile: 'apps/extension/src/content/selection/area-selector/controller.ts',
    reason:
      'Area-selection listener, settlement, and cleanup ownership is exercised through its public controller suite.',
    testFiles: ['apps/extension/src/content/selection/area-selector/index.test.ts'],
  },
  {
    owner: 'content-highlighter-runtime-listeners',
    productionFile: 'apps/extension/src/content/selection/highlighter-runtime/runtime-listeners.ts',
    reason:
      'Highlighter listener registration and Escape policy are split across two owner-local behavior suites.',
    testFiles: [
      'apps/extension/src/content/selection/highlighter-runtime/runtime-escape-key.test.ts',
      'apps/extension/src/content/selection/highlighter-runtime/runtime-listeners.test.ts',
    ],
  },
  {
    owner: 'content-highlighter-runtime-mode',
    productionFile: 'apps/extension/src/content/selection/highlighter-runtime/mode.ts',
    reason:
      'Highlighter enable and disable lifecycle transactions retain separate owner-local behavior suites.',
    testFiles: [
      'apps/extension/src/content/selection/highlighter-runtime/mode.disable.test.ts',
      'apps/extension/src/content/selection/highlighter-runtime/mode.enable.test.ts',
    ],
  },
  {
    owner: 'content-frame-runtime-contracts',
    productionFile: 'apps/extension/src/content/selection/frame-runtime/contracts/index.ts',
    reason:
      'Frame runtime contract shape is exercised through the frame manager, history bridge, and mutation owner suites.',
    testFiles: [
      'apps/extension/src/content/selection/frame-runtime/react/useFrameManager.test.tsx',
      'apps/extension/src/content/selection/frame-runtime/react/useFrameManagerMutations.test.tsx',
      'apps/extension/src/content/selection/frame-runtime/history/bridge.test.ts',
      'apps/extension/src/content/selection/frame-runtime/manager/runtime-mutations.test.ts',
    ],
  },
  {
    owner: 'content-frame-runtime-state',
    productionPrefix: 'apps/extension/src/content/selection/frame-runtime/state/',
    reason:
      'Frame UI store state has owner-local frame history, mutation, and UI-controller coverage.',
    testFiles: [
      'apps/extension/src/content/selection/frame-runtime/history/bridge.test.ts',
      'apps/extension/src/content/selection/frame-runtime/mutation-actions/clear.test.ts',
      'apps/extension/src/content/selection/frame-runtime/mutation-actions/dom.test.ts',
      'apps/extension/src/content/selection/frame-runtime/mutation-actions/remove.test.ts',
      'apps/extension/src/content/selection/frame-runtime/ui-controller/effects.test.tsx',
    ],
  },
  {
    owner: 'content-frame-settings-popover-state',
    productionFile: 'apps/extension/src/content/selection/frame-settings-popover/state/index.ts',
    reason:
      'Frame-settings session state is exercised by the public surface, lifecycle, and action suites.',
    testFiles: [
      'apps/extension/src/content/selection/frame-settings-popover/index.test.tsx',
      'apps/extension/src/content/selection/frame-settings-popover/state/helpers.test.ts',
      'apps/extension/src/content/selection/frame-settings-popover/state/lifecycle.test.tsx',
    ],
  },
  {
    owner: 'content-frame-settings-popover-surface',
    productionFile: 'apps/extension/src/content/selection/frame-settings-popover/index.tsx',
    exclusive: true,
    reason:
      'Frame-settings controller, portal shell, and view wiring have one public surface proof.',
    testFiles: ['apps/extension/src/content/selection/frame-settings-popover/index.test.tsx'],
  },
  {
    owner: 'content-frame-settings-popover-body-predecessor',
    productionFile: 'apps/extension/src/content/selection/frame-settings-popover/body.tsx',
    exclusive: true,
    allowMissingProductionTarget: true,
    reason: 'The removed body forwarding layer is consolidated into the public popover surface.',
    testFiles: ['apps/extension/src/content/selection/frame-settings-popover/index.test.tsx'],
  },
  {
    owner: 'content-frame-settings-popover-portal-predecessor',
    productionFile: 'apps/extension/src/content/selection/frame-settings-popover/surface.tsx',
    exclusive: true,
    allowMissingProductionTarget: true,
    reason: 'The removed portal forwarding layer is consolidated into the public popover surface.',
    testFiles: ['apps/extension/src/content/selection/frame-settings-popover/index.test.tsx'],
  },
  {
    owner: 'content-frame-settings-popover-shell-predecessor',
    productionFile: 'apps/extension/src/content/selection/frame-settings-popover/surface-shell.tsx',
    exclusive: true,
    allowMissingProductionTarget: true,
    reason: 'The removed shell forwarding layer is consolidated into the public popover surface.',
    testFiles: ['apps/extension/src/content/selection/frame-settings-popover/index.test.tsx'],
  },
  {
    owner: 'gallery-library-types',
    productionFile: 'apps/extension/src/gallery/library/types.ts',
    reason:
      'Gallery filter, grid, and preview contracts have state, selector, and surface coverage.',
    testFiles: [
      'apps/extension/src/gallery/state/types.test.ts',
      'apps/extension/src/gallery/state/selectors.test.ts',
      'apps/extension/src/gallery/shell/app-shell/layout.test.tsx',
    ],
  },
  {
    owner: 'gallery-shared-download',
    productionFile: 'apps/extension/src/gallery/shared/download.ts',
    reason:
      'Gallery suites cover download lifecycle, failure, cleanup, and video-review publication.',
    testFiles: [
      'apps/extension/src/gallery/library/actions/shared.download.test.ts',
      'apps/extension/src/gallery/video-review/review.test.tsx',
      'apps/extension/src/gallery/video-review/use-export.test.tsx',
    ],
  },
  {
    owner: 'content-frame-runtime-test-support',
    productionFile: 'apps/extension/src/content/selection/frame-runtime/test-support.ts',
    reason:
      'Frame runtime fixtures are covered by owner-local frame runtime suites that consume the shared builders.',
    testFiles: [
      'apps/extension/src/content/selection/frame-runtime/effects/geometry.test.ts',
      'apps/extension/src/content/selection/frame-runtime/effects/overlay-descriptors.test.ts',
      'apps/extension/src/content/selection/frame-runtime/history/bridge.test.ts',
      'apps/extension/src/content/selection/frame-runtime/host-layout/reconcile.test.ts',
      'apps/extension/src/content/selection/frame-runtime/host-layout/service.test.ts',
    ],
  },
  {
    owner: 'settings-editor-section',
    productionFile: 'apps/extension/src/settings/sections/styles/editor-resources/tools/model.ts',
    reason: 'Settings tool preset ordering is covered by the owner-local model suite.',
    testFiles: ['apps/extension/src/settings/sections/styles/editor-resources/tools/model.test.ts'],
  },
  {
    owner: 'settings-editor-section',
    productionFile:
      'apps/extension/src/settings/sections/styles/editor-resources/palettes/model.ts',
    reason: 'Settings palette ordering is covered by the owner-local model suite.',
    testFiles: [
      'apps/extension/src/settings/sections/styles/editor-resources/palettes/view.test.tsx',
    ],
  },
  {
    owner: 'offscreen-project-export-service-root',
    productionFile: 'apps/extension/src/offscreen/project-export/service/index.ts',
    reason: 'Project export service root side-effect ordering is covered by root service tests.',
    testFiles: [
      'apps/extension/src/offscreen/project-export/service/branches.test.ts',
      'apps/extension/src/offscreen/project-export/service/index.test.ts',
      'apps/extension/src/offscreen/project-export/service/lifecycle.test.ts',
      'apps/extension/src/offscreen/project-export/service/notifications.test.ts',
      'apps/extension/src/offscreen/project-export/service/root.test.ts',
    ],
  },
  {
    owner: 'settings-highlighter-persistence',
    productionFile:
      'apps/extension/src/settings/sections/styles/annotations/borders/persistence.ts',
    reason:
      'Highlighter persistence queue ownership is covered by queue and session regression suites.',
    testFiles: [
      'apps/extension/src/settings/sections/styles/annotations/borders/ordering-actions.queue.test.ts',
      'apps/extension/src/settings/sections/styles/annotations/borders/persistence-actions.behavior.test.ts',
      'apps/extension/src/settings/sections/styles/annotations/borders/persistence-session.test.ts',
      'apps/extension/src/settings/sections/styles/annotations/borders/persistence.test.ts',
    ],
  },
  {
    owner: 'settings-highlighter-persistence-actions',
    productionFile:
      'apps/extension/src/settings/sections/styles/annotations/borders/persistence-actions.ts',
    reason: 'Highlighter settings persistence actions are covered by behavior regressions.',
    testFiles: [
      'apps/extension/src/settings/sections/styles/annotations/borders/persistence-actions.behavior.test.ts',
    ],
  },
  {
    owner: 'settings-highlighter-crud-actions',
    productionFile:
      'apps/extension/src/settings/sections/styles/annotations/borders/crud-actions.ts',
    reason: 'Highlighter preset CRUD actions are covered by focused action suites.',
    testFiles: [
      'apps/extension/src/settings/sections/styles/annotations/borders/actions.integration.test.ts',
      'apps/extension/src/settings/sections/styles/annotations/borders/actions.test.ts',
    ],
  },
  {
    owner: 'settings-highlighter-ordering-actions',
    productionFile:
      'apps/extension/src/settings/sections/styles/annotations/borders/ordering-actions.ts',
    reason:
      'Highlighter insertion-intent persistence ordering is covered by queue and integration tests.',
    testFiles: [
      'apps/extension/src/settings/sections/styles/annotations/borders/actions.integration.test.ts',
      'apps/extension/src/settings/sections/styles/annotations/borders/ordering-actions.queue.test.ts',
    ],
  },
  {
    owner: 'settings-highlighter-storage-state',
    productionFile: 'apps/extension/src/settings/sections/styles/annotations/borders/state.ts',
    reason: 'Highlighter storage sync lifecycle is covered by state storage and race suites.',
    testFiles: [
      'apps/extension/src/settings/sections/styles/annotations/borders/state.loading-race.test.tsx',
      'apps/extension/src/settings/sections/styles/annotations/borders/state.storage-sync.test.tsx',
      'apps/extension/src/settings/sections/styles/annotations/borders/state.test.tsx',
    ],
  },
  {
    owner: 'settings-highlighter-section-composition',
    productionFile:
      'apps/extension/src/settings/sections/styles/annotations/borders/useHighlighterSection.ts',
    reason:
      'Highlighter section composition keeps disposable UI state separate from its persistence session.',
    testFiles: [
      'apps/extension/src/settings/sections/styles/annotations/borders/useHighlighterSection.test.tsx',
    ],
  },
  {
    owner: 'shared-video-project-validation',
    productionFile: 'apps/extension/src/features/video/project/validation/clips.ts',
    reason:
      'Media identity admission shares clip validation with project parser and camera contracts.',
    testFiles: [
      'apps/extension/src/features/video/project/timeline/original-audio.test.ts',
      'apps/extension/src/features/video/project/validation/root.test.ts',
      'apps/extension/src/features/video/project/validation/clips.test.ts',
      'apps/extension/src/features/video/project/validation/project.test.ts',
      'apps/extension/src/features/video/project/camera/appearance.test.ts',
      'apps/extension/src/features/video/project/camera/animation.test.ts',
    ],
  },
  {
    owner: 'shared-video-project-validation',
    productionFile: 'apps/extension/src/features/video/project/validation/root.ts',
    reason: 'Video project boundary validation is covered by parser and transitive boundary tests.',
    testFiles: [
      'apps/extension/src/features/video/project/timeline/original-audio.test.ts',
      'apps/extension/src/features/video/project/validation/root.test.ts',
      'apps/extension/src/offscreen/project-export/service/root.test.ts',
      'apps/extension/src/contracts/messaging/video/validators.project-export.test.ts',
      'apps/extension/src/composition/persistence/projects/index.read-guards.test.ts',
      'apps/extension/src/features/video/project/validation/project-domain-boundary.test.ts',
      'apps/extension/src/features/video/project/validation/project.test.ts',
    ],
  },
  {
    owner: 'shared-video-project-validation',
    productionFile: 'apps/extension/src/features/video/project/validation/optional-branches.ts',
    reason: 'Optional video project branches are covered by focused parser fixtures.',
    testFiles: [
      'apps/extension/src/features/video/project/validation/project-domain-boundary.test.ts',
    ],
  },
  {
    owner: 'shared-color-selector-channel-fields',
    productionFile: 'apps/extension/src/ui/color-selector/picker-channel-fields.tsx',
    reason:
      'RGB/HSL channel composition is exercised by the expanded, section, and typography suites.',
    testFiles: [
      'apps/extension/src/ui/color-selector/expanded.test.tsx',
      'apps/extension/src/ui/color-selector/picker-sections.test.tsx',
      'apps/extension/src/ui/color-selector/typography.test.tsx',
    ],
  },
  {
    owner: 'shared-command-palette-results',
    productionFile: 'apps/extension/src/ui/command-palette/results.tsx',
    reason: 'Result grouping, empty state, selection, and shortcuts are covered by section suites.',
    testFiles: ['apps/extension/src/ui/command-palette/sections.test.tsx'],
  },
  {
    owner: 'shared-compact-inspector-row-controls',
    productionFile: 'apps/extension/src/ui/compact-inspector-controls/row-controls.tsx',
    reason: 'Option, status, and search rows are exercised by the compact surface suite.',
    testFiles: ['apps/extension/src/ui/compact-inspector-controls/surfaces.test.tsx'],
  },
  {
    owner: 'shared-compact-inspector-interactive-style',
    productionFile: 'apps/extension/src/ui/compact-inspector-controls/interactive-control-style.ts',
    reason: 'Interactive control variables and class contracts are covered by the index suite.',
    testFiles: ['apps/extension/src/ui/compact-inspector-controls/index.test.tsx'],
  },
];
