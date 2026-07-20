export const VIDEO_PROJECT_EXPORT_OWNER_MAPPINGS = [
  {
    owner: 'video-project-export-runtime-authority',
    productionFile: 'apps/extension/src/background/media/video/runtime/handlers/export/route.ts',
    reason:
      'Project export runtime route preauthorization is covered by focused route authorization tests.',
    testFiles: [
      'apps/extension/src/background/media/video/runtime/handlers/export/route.authorization.test.ts',
      'apps/extension/src/background/media/video/runtime/handlers/export/root.test.ts',
    ],
  },
  {
    owner: 'video-project-export-runtime-authority',
    productionFile:
      'apps/extension/src/background/media/video/runtime/handlers/export/project-export.ts',
    reason:
      'Project export start/cancel capability ownership is covered by focused handler and router retry suites.',
    testFiles: [
      'apps/extension/src/background/media/video/runtime/handlers/export/project-export.test.ts',
      'apps/extension/src/background/media/video/runtime/handlers/export/project-export.capability-reissue.test.ts',
      'apps/extension/src/background/media/video/runtime/handlers/export/project-export.start-owner.test.ts',
      'apps/extension/src/background/media/video/runtime/handlers/export/project-export.failure-boundaries.test.ts',
    ],
  },
  {
    owner: 'video-project-export-runtime-authority',
    productionFile: 'apps/extension/src/background/media/video/runtime/router.ts',
    reason: 'Project export runtime routing is covered by sender/capability route suites.',
    testFiles: [
      'apps/extension/src/background/media/video/runtime/router.export.test.ts',
      'apps/extension/src/background/media/video/runtime/router.extended.test.ts',
      'apps/extension/src/background/media/video/runtime/handlers/export/root.test.ts',
    ],
  },
  {
    owner: 'video-project-export-runtime-authority',
    productionFile: 'apps/extension/src/background/media/video/runtime/sender-policy.ts',
    reason: 'Video editor/offscreen sender ownership is covered by sender-policy and router tests.',
    testFiles: [
      'apps/extension/src/background/media/video/runtime/sender-policy.test.ts',
      'apps/extension/src/background/media/video/runtime/router.export.test.ts',
    ],
  },
  {
    owner: 'video-project-export-sidecar-contract',
    productionFile: 'apps/extension/src/contracts/messaging/contracts/runtime/video/export.ts',
    reason: 'Recording sidecar IPC validation is covered by focused sidecar boundary fixtures.',
    testFiles: [
      'apps/extension/src/contracts/messaging/contracts/runtime/video/export.test.ts',
      'apps/extension/src/contracts/messaging/contracts/runtime/video/export-sidecar-boundary.test.ts',
    ],
  },
  {
    owner: 'video-project-export-capability-contract',
    productionFile:
      'apps/extension/src/contracts/messaging/contracts/runtime/video/export-capabilities.ts',
    reason: 'Export capability request/response parser drift is covered by focused contract tests.',
    testFiles: [
      'apps/extension/src/contracts/messaging/contracts/runtime/video/export-capabilities.test.ts',
    ],
  },
  {
    owner: 'video-project-export-capability-contract',
    productionFile: 'apps/extension/src/contracts/messaging/contracts/types.ts',
    reason:
      'Runtime export capability payload shape is covered by focused capability contract tests.',
    testFiles: [
      'apps/extension/src/contracts/messaging/contracts/runtime/video/export-capabilities.test.ts',
    ],
  },
  {
    owner: 'video-project-export-ledger-owner',
    productionFile: 'apps/extension/src/composition/persistence/export-ledger/index.ts',
    reason: 'Project export ledger ownership persistence is covered by focused ledger tests.',
    testFiles: [
      'apps/extension/src/composition/persistence/export-ledger/index.test.ts',
      'apps/extension/src/composition/persistence/export-ledger/owner.test.ts',
    ],
  },
  {
    owner: 'video-project-export-ledger-owner',
    productionFile: 'apps/extension/src/composition/persistence/export-ledger/write-queue.ts',
    reason: 'Project export ledger write serialization is covered by ledger and erasure tests.',
    testFiles: [
      'apps/extension/src/composition/persistence/export-ledger/index.test.ts',
      'apps/extension/src/composition/persistence/export-ledger/privacy-erasure.test.ts',
    ],
  },
  {
    owner: 'video-project-export-ledger-owner',
    productionFile: 'apps/extension/src/composition/persistence/export-ledger/privacy-erasure.ts',
    reason: 'Corrupt ledger removal is covered by the owner-local privacy erasure test.',
    testFiles: ['apps/extension/src/composition/persistence/export-ledger/privacy-erasure.test.ts'],
  },
  {
    owner: 'video-project-export-ledger-owner',
    productionFile: 'apps/extension/src/composition/persistence/export-ledger/guards.ts',
    reason: 'Project export ledger owner parsing is covered by focused ledger owner tests.',
    testFiles: ['apps/extension/src/composition/persistence/export-ledger/owner.test.ts'],
  },
  {
    owner: 'video-project-export-ledger-owner',
    productionFile: 'apps/extension/src/composition/persistence/export-ledger/types.ts',
    reason: 'Project export ledger owner fields are covered by focused ledger owner tests.',
    testFiles: ['apps/extension/src/composition/persistence/export-ledger/owner.test.ts'],
  },
  {
    exclusive: true,
    owner: 'video-project-export-frame-renderer',
    productionFile: 'apps/extension/src/offscreen/project-export/renderer/frame.ts',
    reason:
      'Export frame composition is covered by focused frame, background, overlay, and effect runtime suites.',
    testFiles: [
      'apps/extension/src/offscreen/project-export/renderer/background.test.ts',
      'apps/extension/src/offscreen/project-export/renderer/clip.test.ts',
      'apps/extension/src/offscreen/project-export/renderer/frame.locked-overlays.motion-blur.test.ts',
      'apps/extension/src/offscreen/project-export/renderer/frame.locked-overlays.test.ts',
      'apps/extension/src/offscreen/project-export/render-loop/composite/run/frame.test.ts',
      'apps/extension/src/offscreen/project-export/render-loop/frame-driven/render/frame.test.ts',
      'apps/extension/src/offscreen/project-export/renderer/frame.test.ts',
    ],
  },
  {
    owner: 'video-project-export-editor-cancel',
    productionFile: 'apps/extension/src/video-editor/project/operations/export.ts',
    reason:
      'Editor cancel token reissue and retry behavior is covered by focused export helper tests.',
    testFiles: ['apps/extension/src/video-editor/project/operations/export.test.ts'],
  },
  {
    owner: 'video-project-export-editor-cancel',
    productionFile: 'apps/extension/src/video-editor/runtime/commands/export.ts',
    reason: 'Editor cancel UI state transitions are covered by focused action-handler tests.',
    testFiles: ['apps/extension/src/video-editor/runtime/commands/export.test.tsx'],
  },
  {
    owner: 'video-project-export-editor-cancel',
    productionFile: 'apps/extension/src/video-editor/runtime/commands/types.ts',
    reason: 'Action handler export params are covered by focused action-handler tests.',
    testFiles: ['apps/extension/src/video-editor/runtime/commands/export.test.tsx'],
  },
  {
    owner: 'video-project-export-editor-cancel',
    productionFile: 'apps/extension/src/video-editor/state/export-state/actions.ts',
    reason: 'Non-terminal export cancellation failure state is covered by focused store tests.',
    testFiles: [
      'apps/extension/src/video-editor/state/export-state/cancellation.test.ts',
      'apps/extension/src/video-editor/state/export-state/index.test.ts',
      'apps/extension/src/video-editor/state/export-state/repeated-export.test.ts',
    ],
  },
  {
    owner: 'video-project-export-editor-cancel',
    productionFile: 'apps/extension/src/video-editor/state/export-state/transitions.ts',
    reason: 'Non-terminal export cancellation failure state is covered by focused store tests.',
    testFiles: [
      'apps/extension/src/video-editor/state/export-state/cancellation.test.ts',
      'apps/extension/src/video-editor/state/export-state/index.test.ts',
      'apps/extension/src/video-editor/state/export-state/repeated-export.test.ts',
    ],
  },
  {
    owner: 'video-project-export-editor-cancel',
    productionFile: 'apps/extension/src/video-editor/state/export-state/index.ts',
    reason: 'Export state facade wiring is covered by focused store cancellation tests.',
    testFiles: ['apps/extension/src/video-editor/state/export-state/cancellation.test.ts'],
  },
  {
    owner: 'video-project-export-editor-cancel',
    productionFile: 'apps/extension/src/video-editor/state/types.ts',
    reason: 'Export store action surface is covered by focused store and action-handler tests.',
    testFiles: [
      'apps/extension/src/video-editor/state/export-state/cancellation.test.ts',
      'apps/extension/src/video-editor/runtime/commands/export.test.tsx',
    ],
  },
];
