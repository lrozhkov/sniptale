export const RECORDING_HISTORY_OWNER_MAPPINGS = [
  {
    owner: 'recording-history-editor-selection-consumers',
    productionFile: 'apps/extension/src/video-editor/state/selection-actions.ts',
    reason:
      'The editor store suites exercise selection transitions, stale targets and track ownership.',
    testFiles: [
      'apps/extension/src/video-editor/state/root-state.test.ts',
      'apps/extension/src/video-editor/state/root-state.branches.test.ts',
      'apps/extension/src/video-editor/state/root-state.selection.test.ts',
    ],
  },
  {
    owner: 'recording-session-boundary-consumers',
    productionFile: 'apps/extension/src/contracts/messaging/contracts/runtime/video/session.ts',
    reason:
      'Recording readiness exercises camera source admission and source-bound control contracts.',
    testFiles: [
      'apps/extension/src/contracts/messaging/parsers/boundary.recording-readiness.test.ts',
    ],
  },
  {
    owner: 'recording-deletion-scenario-consumer',
    productionFile: 'apps/extension/src/composition/persistence/sync-capture/apply-deletion.ts',
    reason:
      'Scenario deletion exercises the shared catalog deletion authority and retained source cleanup.',
    testFiles: ['apps/extension/src/composition/persistence/sync-capture/apply-scenario.test.ts'],
  },
  {
    owner: 'browser-recording-history-bootstrap',
    productionFile:
      'apps/extension/src/background/media/video/manager/preflight.content-surface.ts',
    exclusive: true,
    reason:
      'History mode bootstrap uses the content-surface owner and recording-context preparation suites.',
    testFiles: [
      'apps/extension/src/background/media/video/manager/preflight.content-surface.test.ts',
      'apps/extension/src/background/media/video/manager/preflight.content-surface.controlled.test.ts',
      'apps/extension/src/background/media/video/manager/recording-context.prepare.test.ts',
    ],
  },
  {
    owner: 'native-recording-history-lifecycle',
    productionFile: 'apps/extension/src/background/capture/native-app/history-ingestion.ts',
    exclusive: true,
    reason: `Recording ingestion, completed-parent recovery, lease refusal and exact receipt replay use the
recording controller suites.`,
    testFiles: [
      'apps/extension/src/background/capture/native-app/history-ingestion.test.ts',
      'apps/extension/src/background/capture/native-app/controller-recording.test.ts',
      'apps/extension/src/background/capture/native-app/recording-recovery.test.ts',
      'apps/extension/src/background/capture/native-app/history-pull.test.ts',
      'apps/extension/src/background/capture/native-app/controller-staging-failures.test.ts',
      'apps/extension/src/background/capture/native-app/controller-commit-failures.test.ts',
      'apps/extension/src/background/capture/native-app/controller.lifecycle-gate.test.ts',
      'apps/extension/src/background/capture/native-app/resume.test.ts',
    ],
  },
  {
    owner: 'native-recording-history-lifecycle',
    productionFile: 'apps/extension/src/background/capture/native-app/ingestion-types.ts',
    exclusive: true,
    reason: `Recording ingestion, completed-parent recovery, lease refusal and exact receipt replay use the
recording controller suites.`,
    testFiles: [
      'apps/extension/src/background/capture/native-app/history-ingestion.test.ts',
      'apps/extension/src/background/capture/native-app/controller-recording.test.ts',
      'apps/extension/src/background/capture/native-app/recording-recovery.test.ts',
      'apps/extension/src/background/capture/native-app/history-pull.test.ts',
      'apps/extension/src/background/capture/native-app/controller-staging-failures.test.ts',
      'apps/extension/src/background/capture/native-app/controller-commit-failures.test.ts',
      'apps/extension/src/background/capture/native-app/controller.lifecycle-gate.test.ts',
      'apps/extension/src/background/capture/native-app/resume.test.ts',
    ],
  },
  {
    owner: 'native-recording-history-lifecycle',
    productionFile: 'apps/extension/src/background/capture/native-app/recording.ts',
    exclusive: true,
    reason: `Recording ingestion, completed-parent recovery, lease refusal and exact receipt replay use the
recording controller suites.`,
    testFiles: [
      'apps/extension/src/background/capture/native-app/history-ingestion.test.ts',
      'apps/extension/src/background/capture/native-app/controller-recording.test.ts',
      'apps/extension/src/background/capture/native-app/recording-recovery.test.ts',
      'apps/extension/src/background/capture/native-app/history-pull.test.ts',
      'apps/extension/src/background/capture/native-app/controller-staging-failures.test.ts',
      'apps/extension/src/background/capture/native-app/controller-commit-failures.test.ts',
      'apps/extension/src/background/capture/native-app/controller.lifecycle-gate.test.ts',
      'apps/extension/src/background/capture/native-app/resume.test.ts',
    ],
  },
  {
    owner: 'native-recording-history-lifecycle',
    productionFile: 'apps/extension/src/background/capture/native-app/sessions.ts',
    exclusive: true,
    reason: `Recording ingestion, completed-parent recovery, lease refusal and exact receipt replay use the
recording controller suites.`,
    testFiles: [
      'apps/extension/src/background/capture/native-app/history-ingestion.test.ts',
      'apps/extension/src/background/capture/native-app/controller-recording.test.ts',
      'apps/extension/src/background/capture/native-app/recording-recovery.test.ts',
      'apps/extension/src/background/capture/native-app/history-pull.test.ts',
      'apps/extension/src/background/capture/native-app/controller-staging-failures.test.ts',
      'apps/extension/src/background/capture/native-app/controller-commit-failures.test.ts',
      'apps/extension/src/background/capture/native-app/controller.lifecycle-gate.test.ts',
      'apps/extension/src/background/capture/native-app/resume.test.ts',
    ],
  },
  {
    owner: 'review-transport-audio-consumers',
    productionFile: 'apps/extension/src/gallery/video-review/use-review-transport.ts',
    exclusive: true,
    reason:
      'The real editor integration and audio runtime suites cover transport, source ownership and playback admission.',
    testFiles: [
      'apps/extension/src/gallery/video-review/index.test.tsx',
      'apps/extension/src/gallery/video-review/use-review-action-audio-runtime.test.tsx',
      'apps/extension/src/gallery/video-review/use-review-audio-runtime.test.tsx',
    ],
  },
  {
    owner: 'recording-cursor-renderer-consumers',
    productionFile: 'apps/extension/src/workflows/video-review/cursor-trajectory.ts',
    exclusive: true,
    allowCrossOwner: true,
    reason:
      'Archive and Native consumers cover bounded reads, interval availability, cancellation and camera geometry.',
    testFiles: [
      'apps/extension/src/workflows/video-review/recording-review.test.ts',
      'apps/extension/src/workflows/video-review/recording-render.test.ts',
      'apps/extension/src/workflows/video-review/cursor-trajectory.test.ts',
      'apps/extension/src/video-editor/runtime/cursor-availability.test.tsx',
      'apps/extension/src/video-editor/preview/stage/runtime/cursor-trajectory.test.tsx',
      'apps/extension/src/video-editor/workspace/sidebar/selection/motion/fields.test.tsx',
      'apps/extension/src/video-editor/workspace/sidebar/selection/motion/framing-preview.test.tsx',
    ],
  },
  {
    owner: 'review-cursor-source-transfer',
    productionFile: 'apps/extension/src/features/video/review/project-cursor.ts',
    exclusive: true,
    reason:
      'Review conversion exercises legacy and compact cursor bindings, source identity and reopen.',
    testFiles: ['apps/extension/src/features/video/review/project-conversion.cursor.test.ts'],
  },
  {
    owner: 'recording-selection-session-contract',
    productionFile: 'apps/extension/src/video-editor/contracts/commands/session.ts',
    reason: 'Observed action selection is consumed by project operations and effect commands.',
    testFiles: [
      'apps/extension/src/video-editor/project/operations/recording-events-selection.test.ts',
      'apps/extension/src/video-editor/project/state/effects.recording-events.test.ts',
    ],
  },
  {
    owner: 'recording-selection-timeline-contract',
    productionFile: 'apps/extension/src/video-editor/contracts/commands/timeline.ts',
    reason: 'Observed signal selection is consumed by project operations and effect commands.',
    testFiles: [
      'apps/extension/src/video-editor/project/operations/recording-events-selection.test.ts',
      'apps/extension/src/video-editor/project/state/effects.recording-events.test.ts',
    ],
  },
];
