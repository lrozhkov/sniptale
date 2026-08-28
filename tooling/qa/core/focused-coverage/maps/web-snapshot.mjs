export const WEB_SNAPSHOT_OWNER_MAPPINGS = [
  {
    owner: 'web-snapshot-runtime-transfer-contract',
    productionPrefix:
      'apps/extension/src/contracts/messaging/contracts/runtime/actions/save.web-snapshot',
    reason: 'Web-copy asset session contracts are covered by focused save contract tests.',
    testFiles: [
      'apps/extension/src/contracts/messaging/contracts/runtime/actions/save.web-snapshot.test.ts',
    ],
  },
  {
    owner: 'web-snapshot-runtime-transfer-contract',
    productionFile: 'apps/extension/src/contracts/messaging/contracts/runtime/actions/save.ts',
    reason: 'Save contract facade wiring is covered by focused save contract tests.',
    testFiles: [
      'apps/extension/src/contracts/messaging/contracts/runtime/actions/save.test.ts',
      'apps/extension/src/contracts/messaging/contracts/runtime/actions/save.web-snapshot.test.ts',
    ],
  },
  {
    owner: 'web-snapshot-message-boundary',
    productionPrefix: 'apps/extension/src/contracts/messaging/parsers/',
    reason: 'Web-copy asset session parsing is covered by focused parser boundary tests.',
    testFiles: [
      'apps/extension/src/contracts/messaging/parsers/boundary.test.ts',
      'apps/extension/src/contracts/messaging/parsers/supported-types.data.test.ts',
    ],
  },
  {
    owner: 'web-snapshot-message-boundary',
    productionFile: 'packages/runtime-contracts/src/messaging/message-types/index.ts',
    reason:
      'Web snapshot message type surfaces are covered by focused contract and boundary tests.',
    testFiles: [
      'apps/extension/src/contracts/messaging/contracts/runtime/actions/save.web-snapshot.test.ts',
      'apps/extension/src/contracts/messaging/parsers/supported-types.data.test.ts',
    ],
  },
  {
    owner: 'web-snapshot-message-boundary',
    productionFile: 'packages/runtime-contracts/src/web-snapshot/index.ts',
    reason: 'Web-copy asset session types are covered by focused contract tests.',
    testFiles: [
      'apps/extension/src/contracts/messaging/contracts/runtime/actions/save.web-snapshot.test.ts',
    ],
  },
  {
    owner: 'web-snapshot-content-transfer',
    productionPrefix: 'apps/extension/src/content/parser/web-snapshot/',
    reason: 'Content Web-copy production and packaging are covered by focused service suites.',
    testFiles: [
      'apps/extension/src/content/parser/web-snapshot/package.test.ts',
      'apps/extension/src/content/parser/web-snapshot/service.test.ts',
      'apps/extension/src/content/parser/web-snapshot/service.integration.test.ts',
    ],
  },
  {
    owner: 'web-snapshot-background-transfer',
    productionPrefix: 'apps/extension/src/background/capture/routing/web-snapshot/',
    reason: 'Background Web-copy asset sessions are covered by their focused owner tests.',
    testFiles: ['apps/extension/src/background/capture/routing/web-snapshot/session.test.ts'],
  },
  {
    owner: 'web-snapshot-background-transfer',
    productionFile: 'apps/extension/src/background/capture/routing/actions.web-snapshot.ts',
    reason: 'Web-copy resource registration and fetch routes are covered by focused route tests.',
    testFiles: ['apps/extension/src/background/capture/routing/web-snapshot-asset-route.test.ts'],
  },
  {
    owner: 'web-snapshot-background-transfer',
    productionFile: 'apps/extension/src/background/capture/routing/types.ts',
    reason: 'Capture route Web-copy asset typing is covered by focused route tests.',
    testFiles: [
      'apps/extension/src/background/capture/routing/route/dispatcher.test.ts',
      'apps/extension/src/background/capture/routing/web-snapshot-asset-route.test.ts',
    ],
  },
  {
    owner: 'web-snapshot-runtime-routing',
    productionFile: 'apps/extension/src/background/runtime/routing/message-guards/guards/tab.ts',
    reason: 'Runtime tab guard Web-copy asset authorization is covered by guard tests.',
    testFiles: ['apps/extension/src/background/runtime/routing/message-guards/guards/tab.test.ts'],
  },
  {
    owner: 'web-snapshot-runtime-routing',
    productionFile: 'apps/extension/src/background/runtime/routing/boundary/sender-policy.ts',
    reason: 'Runtime sender policy Web-copy authorization is covered by focused policy tests.',
    testFiles: [
      'apps/extension/src/background/runtime/routing/boundary/preflight.classifier.test.ts',
      'apps/extension/src/background/runtime/routing/boundary/sender-policy.test.ts',
    ],
  },
  {
    owner: 'web-snapshot-runtime-routing',
    productionFile:
      'apps/extension/src/background/runtime/routing/boundary/popup-export-routing.ts',
    reason:
      'Runtime popup-export web snapshot routing is covered by focused popup-export route tests.',
    testFiles: [
      'apps/extension/src/background/runtime/routing/boundary/popup-export-routing.branches.test.ts',
      'apps/extension/src/background/runtime/routing/boundary/popup-export-routing.content-intent.test.ts',
      'apps/extension/src/background/runtime/routing/boundary/popup-export-routing.launch-intent.test.ts',
      'apps/extension/src/background/runtime/routing/boundary/popup-export-routing.test.ts',
      'apps/extension/src/background/runtime/routing/boundary/popup-export-routing.viewer.test.ts',
    ],
  },
  {
    owner: 'web-snapshot-media-hub-transfer',
    productionPrefix: 'apps/extension/src/background/media-hub/web-snapshot',
    reason: 'Media hub Page Package persistence and validation are covered by focused owner tests.',
    testFiles: [
      'apps/extension/src/background/media-hub/web-snapshot.test.ts',
      'apps/extension/src/background/media-hub/web-snapshot-validation.test.ts',
    ],
  },
  {
    owner: 'shared-web-snapshot-provenance-helper',
    productionFile: 'apps/extension/src/features/web-snapshot/provenance.ts',
    reason: 'Web snapshot manifest provenance is covered by save and backup egress tests.',
    testFiles: [
      'apps/extension/src/background/media-hub/web-snapshot.test.ts',
      'apps/extension/src/composition/persistence/media-library/index.library.web-snapshot-provenance.test.ts',
      'apps/extension/src/features/web-snapshot/provenance.test.ts',
    ],
  },
  {
    owner: 'shared-web-snapshot-manifest-helper',
    productionFile: 'apps/extension/src/features/web-snapshot/manifest.ts',
    reason: 'Web snapshot manifest helpers are covered by save and backup egress tests.',
    testFiles: [
      'apps/extension/src/background/media-hub/web-snapshot.test.ts',
      'apps/extension/src/content/parser/web-snapshot/package.test.ts',
    ],
  },
];
