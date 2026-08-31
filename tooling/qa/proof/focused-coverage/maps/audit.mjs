export const AUDIT_OWNER_MAPPINGS = [
  {
    owner: 'audit-video-runtime-contracts',
    productionFile:
      'apps/extension/src/contracts/messaging/contracts/runtime/video/offscreen/events.ts',
    exclusive: true,
    reason:
      'Offscreen source-ready and lifecycle boundary messages are covered by the focused event parser suites.',
    testFiles: [
      'apps/extension/src/contracts/messaging/contracts/runtime/video/offscreen/control.test.ts',
      'apps/extension/src/contracts/messaging/contracts/runtime/video/offscreen/events.region-selection.test.ts',
      'apps/extension/src/contracts/messaging/contracts/runtime/video/offscreen/events.test.ts',
    ],
  },
  {
    owner: 'audit-video-message-validators',
    productionFile: 'apps/extension/src/contracts/messaging/video/validators.ts',
    exclusive: true,
    reason:
      'Video settings and lifecycle boundary validators are covered by focused validator suites.',
    testFiles: [
      'apps/extension/src/contracts/messaging/video/session.test.ts',
      'apps/extension/src/contracts/messaging/video/validators.live-settings.test.ts',
      'apps/extension/src/contracts/messaging/video/validators.project-export.test.ts',
      'apps/extension/src/contracts/messaging/video/validators.test.ts',
    ],
  },
  {
    owner: 'audit-db-read-guards',
    productionPrefix: 'apps/extension/src/composition/persistence/infrastructure/indexed-db/',
    exclusive: true,
    reason: 'Audit DB parser guard changes are covered by focused DB boundary suites.',
    testFiles: [
      'apps/extension/src/composition/persistence/diagnostics/index.test.ts',
      'apps/extension/src/composition/persistence/projects/index.read-guards.test.ts',
      'apps/extension/src/composition/persistence/scenario/projects/assets.test.ts',
      'apps/extension/src/composition/persistence/scenario/projects/exports.test.ts',
      'apps/extension/src/composition/persistence/scenario/projects/project.test.ts',
      'apps/extension/src/composition/persistence/effect-bundles/index.test.ts',
    ],
  },
  {
    owner: 'audit-video-runtime-export',
    productionPrefix: 'apps/extension/src/background/media/video/runtime/',
    exclusive: true,
    reason: 'Audit video runtime routes are covered by focused runtime suites.',
    testFiles: [
      'apps/extension/src/background/media/video/runtime/export-capabilities.test.ts',
      'apps/extension/src/background/media/video/runtime/handlers/export/project-export.test.ts',
      'apps/extension/src/background/media/video/runtime/handlers/state/offscreen-lifecycle.test.ts',
      'apps/extension/src/background/media/video/runtime/handlers/state/root.test.ts',
      'apps/extension/src/background/media/video/runtime/router.branches.test.ts',
      'apps/extension/src/background/media/video/runtime/router.fallback.test.ts',
    ],
  },
  {
    owner: 'audit-parser-and-ai-privacy',
    productionPrefix: 'apps/extension/src/content/parser/parsers/gwt/',
    exclusive: true,
    reason: 'Audit parser privacy changes are covered by focused GWT parser suites.',
    testFiles: [
      'apps/extension/src/content/parser/parsers/gwt/attr-list-dynamic-fields.helpers.test.ts',
      'apps/extension/src/content/parser/parsers/gwt/attr-list-dynamic-fields.privacy.test.ts',
    ],
  },
  {
    owner: 'audit-llm-privacy',
    productionPrefix: 'apps/extension/src/background/ai/llm/',
    exclusive: true,
    reason: 'Audit LLM payload privacy changes are covered by focused router suites.',
    testFiles: [
      'apps/extension/src/background/ai/llm/router-processing.test.ts',
      'apps/extension/src/background/ai/llm/editor-router.attachments.test.ts',
    ],
  },
  {
    owner: 'audit-shared-message-contracts',
    productionFile: 'packages/runtime-contracts/src/messaging/message-types/index.ts',
    reason: 'Shared message contract changes are exercised by messaging validator tests.',
    testFiles: ['apps/extension/src/contracts/messaging/validators/shared.test.ts'],
  },
  {
    owner: 'audit-editor-export-disclosure',
    productionPrefix: 'apps/extension/src/editor/inspector/document-actions/',
    exclusive: true,
    reason: 'Editor export disclosure changes are covered by focused document action suites.',
    testFiles: [
      'apps/extension/src/editor/inspector/document-actions/disclosure-shared.test.tsx',
      'apps/extension/src/editor/inspector/document-actions/export-image-size.test.tsx',
      'apps/extension/src/editor/inspector/document-actions/export-settings.test.tsx',
      'apps/extension/src/editor/inspector/document-actions/settings.test.ts',
    ],
  },
  {
    owner: 'audit-offscreen-project-export',
    productionPrefix: 'apps/extension/src/offscreen/project-export/',
    exclusive: true,
    reason: 'Offscreen project export changes are covered by focused export suites.',
    testFiles: [
      'apps/extension/src/offscreen/project-export/scope.test.ts',
      'apps/extension/src/offscreen/project-export/service/lifecycle.test.ts',
    ],
  },
  {
    owner: 'audit-security-boundaries',
    productionPrefix: 'packages/platform/src/security/',
    exclusive: true,
    reason: 'Security privacy and KDF boundaries are covered by focused security suites.',
    testFiles: [
      'packages/platform/src/security/ai-payload-input.test.ts',
      'packages/platform/src/security/ai-payload-privacy.test.ts',
      'packages/platform/src/security/local-secret-crypto.test.ts',
      'packages/platform/src/security/secure-random-id.test.ts',
    ],
  },
  {
    owner: 'audit-app-security-boundaries',
    productionPrefix: 'apps/extension/src/features/ai/privacy/',
    exclusive: true,
    reason: 'App-local security adapters are covered by focused security suites.',
    testFiles: ['apps/extension/src/features/ai/privacy/index.test.ts'],
  },
  {
    owner: 'audit-background-page-package-job',
    productionPrefix: 'apps/extension/src/background/capture/page-package/job/',
    exclusive: true,
    allowCrossOwner: true,
    reason:
      'Page Package job, staging, download, and recovery authority are covered by focused owner tests.',
    testFiles: [
      'apps/extension/src/background/capture/page-package/job/download.test.ts',
      'apps/extension/src/background/capture/page-package/job/execute.test.ts',
      'apps/extension/src/background/capture/page-package/job/index.test.ts',
      'apps/extension/src/background/capture/page-package/job/page-boundary.test.ts',
      'apps/extension/src/background/capture/page-package/job/page-phase.test.ts',
      'apps/extension/src/background/capture/page-package/job/recovery.test.ts',
      'apps/extension/src/background/capture/page-package/job/route.test.ts',
      'apps/extension/src/background/capture/page-package/job/runtime-state.test.ts',
      'apps/extension/src/background/capture/page-package/job/stage-route.test.ts',
      'apps/extension/src/background/capture/page-package/job/staging.test.ts',
      'apps/extension/src/background/capture/page-package/job/storage.test.ts',
    ],
  },
  {
    owner: 'audit-page-export-diagnostics',
    productionFile: 'apps/extension/src/content/parser/export-manager/diagnostics/index.ts',
    exclusive: true,
    reason:
      'Native page diagnostics artifacts are covered by the focused diagnostics facade suite.',
    testFiles: ['apps/extension/src/content/parser/export-manager/diagnostics/index.test.ts'],
  },
  {
    owner: 'audit-page-export-diagnostics-dom-driver',
    productionFile: 'apps/extension/src/content/parser/export-manager/diagnostics/dom-driver.ts',
    exclusive: true,
    reason: 'Live diagnostics DOM access is covered by its colocated host-page driver suite.',
    testFiles: ['apps/extension/src/content/parser/export-manager/diagnostics/dom-driver.test.ts'],
  },
  {
    owner: 'audit-page-export-diagnostics-source',
    productionFile: 'apps/extension/src/content/parser/export-manager/service/source.ts',
    exclusive: true,
    reason:
      'Snapshot-to-live diagnostics selection and the source helpers consumed by export composition are covered by focused service suites.',
    testFiles: [
      'apps/extension/src/content/parser/export-manager/service/source.test.ts',
      'apps/extension/src/content/parser/export-manager/service/assets.test.ts',
      'apps/extension/src/content/parser/export-manager/service/branches.test.ts',
      'apps/extension/src/content/parser/export-manager/service/index.test.ts',
      'apps/extension/src/content/parser/export-manager/service/pipeline.test.ts',
    ],
  },
  {
    owner: 'audit-page-export-diagnostics-composition',
    productionFile: 'apps/extension/src/content/parser/export-manager/service/assets.ts',
    exclusive: true,
    reason: 'Composed page diagnostic artifact admission is covered by the focused assets suite.',
    testFiles: ['apps/extension/src/content/parser/export-manager/service/assets.test.ts'],
  },
  {
    owner: 'audit-page-export-basic-log-admission',
    productionFile: 'apps/extension/src/content/parser/export-manager/diagnostics/core.ts',
    exclusive: true,
    reason: 'Basic-log-only core artifact admission is covered by focused diagnostics suites.',
    testFiles: [
      'apps/extension/src/content/parser/export-manager/diagnostics/core.test.ts',
      'apps/extension/src/content/parser/export-manager/service/assets.test.ts',
    ],
  },
  {
    owner: 'audit-page-export-dom-redaction',
    productionPrefix: 'apps/extension/src/content/parser/export-manager/diagnostics/page-snapshot.',
    exclusive: true,
    reason: 'DOM and URL attribute minimization is covered by focused snapshot security suites.',
    testFiles: [
      'apps/extension/src/content/parser/export-manager/diagnostics/page-snapshot.source.test.ts',
      'apps/extension/src/content/parser/export-manager/diagnostics/page-snapshot.test.ts',
      'apps/extension/src/content/parser/export-manager/diagnostics/page-snapshot.url-sanitization.test.ts',
    ],
  },
  {
    owner: 'audit-page-package-extended-diagnostic-evidence',
    productionPrefix:
      'apps/extension/src/content/parser/export-manager/diagnostics/extended-evidence.',
    exclusive: true,
    reason:
      'Extended live-DOM evidence redaction, metadata and bounds are covered by focused hostile proof.',
    testFiles: [
      'apps/extension/src/content/parser/export-manager/diagnostics/extended-evidence.dom.test.ts',
      'apps/extension/src/content/parser/export-manager/diagnostics/extended-evidence.test.ts',
    ],
  },
  {
    owner: 'audit-popup-export-job-contracts',
    productionFile: 'apps/extension/src/contracts/messaging/contracts/runtime/actions/export.ts',
    exclusive: true,
    reason: 'Popup export job request and response guards are covered by focused contract suites.',
    testFiles: [
      'apps/extension/src/contracts/messaging/contracts/runtime/actions/core.test.ts',
      'apps/extension/src/contracts/messaging/contracts/runtime/actions/export.job.test.ts',
      'apps/extension/src/contracts/messaging/validators/shared-export.test.ts',
    ],
  },
  {
    owner: 'audit-popup-export-runtime-dependencies',
    productionFile: 'apps/extension/src/popup/shell/export/runtime/default-deps.ts',
    exclusive: true,
    reason: 'Popup export native job dependencies are covered by the focused adapter suite.',
    testFiles: ['apps/extension/src/popup/shell/export/runtime/default-deps.test.ts'],
  },
  {
    owner: 'audit-popup-export-status-client',
    productionPrefix: 'apps/extension/src/popup/shell/export/runtime/message-listener/',
    exclusive: true,
    reason:
      'Revision ordering and reconnect behavior are covered by focused popup listener suites.',
    testFiles: [
      'apps/extension/src/popup/shell/export/runtime/message-listener.test.ts',
      'apps/extension/src/popup/shell/export/runtime/message-listener/hook.test.tsx',
    ],
  },
  {
    owner: 'audit-messaging-validator-contracts',
    productionPrefix: 'apps/extension/src/contracts/messaging/validators/',
    exclusive: true,
    reason: 'Messaging validator changes are covered by focused validator suites.',
    testFiles: [
      'apps/extension/src/contracts/messaging/validators/shared.test.ts',
      'apps/extension/src/contracts/messaging/video/validators.test.ts',
    ],
  },
];
