export const WEB_SNAPSHOT_OWNER_MAPPINGS = [
  {
    owner: 'web-snapshot-runtime-transfer-contract',
    productionPrefix:
      'apps/extension/src/contracts/messaging/contracts/runtime/actions/save.web-snapshot',
    reason:
      'Web snapshot staged transfer runtime contracts are covered by focused save contract tests.',
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
    reason:
      'Web snapshot staged transfer boundary parsing is covered by focused parser boundary tests.',
    testFiles: [
      'apps/extension/src/contracts/messaging/parsers/boundary.test.ts',
      'apps/extension/src/contracts/messaging/parsers/boundary.web-snapshot.test.ts',
    ],
  },
  {
    owner: 'web-snapshot-message-boundary',
    productionFile: 'packages/runtime-contracts/src/messaging/message-types/index.ts',
    reason:
      'Web snapshot message type surfaces are covered by focused contract and boundary tests.',
    testFiles: [
      'apps/extension/src/contracts/messaging/contracts/runtime/actions/save.web-snapshot.test.ts',
      'apps/extension/src/contracts/messaging/parsers/boundary.web-snapshot.test.ts',
    ],
  },
  {
    owner: 'web-snapshot-message-boundary',
    productionFile: 'packages/runtime-contracts/src/web-snapshot/index.ts',
    reason: 'Web snapshot staged payload types are covered by focused contract tests.',
    testFiles: [
      'apps/extension/src/contracts/messaging/contracts/runtime/actions/save.web-snapshot.test.ts',
    ],
  },
  {
    owner: 'web-snapshot-content-transfer',
    productionPrefix: 'apps/extension/src/content/parser/web-snapshot/',
    reason:
      'Content web snapshot packaging and staged transfer are covered by focused service suites.',
    testFiles: [
      'apps/extension/src/content/parser/web-snapshot/package.test.ts',
      'apps/extension/src/content/parser/web-snapshot/service.test.ts',
      'apps/extension/src/content/parser/web-snapshot/service.integration.test.ts',
    ],
  },
  {
    owner: 'web-snapshot-popup-transfer',
    productionFile: 'apps/extension/src/content/parser/popup-export/controller/snapshot.ts',
    reason: 'Popup web snapshot staged handoff is covered by focused controller tests.',
    testFiles: ['apps/extension/src/content/parser/popup-export/controller/snapshot.test.ts'],
  },
  {
    owner: 'web-snapshot-background-transfer',
    productionPrefix: 'apps/extension/src/background/capture/routing/web-snapshot/',
    reason: 'Background web snapshot sessions and staged blobs are covered by focused owner tests.',
    testFiles: [
      'apps/extension/src/background/capture/routing/web-snapshot/session.test.ts',
      'apps/extension/src/background/capture/routing/web-snapshot/staged-blobs.test.ts',
    ],
  },
  {
    owner: 'web-snapshot-background-transfer',
    productionFile: 'apps/extension/src/background/capture/routing/actions.gallery.ts',
    reason:
      'Gallery web snapshot save and staged chunk handlers are covered by focused action tests.',
    testFiles: [
      'apps/extension/src/background/capture/routing/actions.gallery.test.ts',
      'apps/extension/src/background/capture/routing/actions.gallery.staged.test.ts',
      'apps/extension/src/background/capture/routing/gallery-update-capabilities.test.ts',
    ],
  },
  {
    owner: 'web-snapshot-background-transfer',
    productionFile: 'apps/extension/src/background/capture/routing/actions.ts',
    reason: 'Capture action facade wiring is covered by focused route tests.',
    testFiles: [
      'apps/extension/src/background/capture/routing/route/dispatcher.test.ts',
      'apps/extension/src/background/capture/routing/web-snapshot-asset-route.test.ts',
    ],
  },
  {
    owner: 'web-snapshot-background-transfer',
    productionFile: 'apps/extension/src/background/capture/routing/route/index.ts',
    reason: 'Capture route staged web snapshot dispatch is covered by focused route tests.',
    testFiles: [
      'apps/extension/src/background/capture/routing/route/dispatcher.test.ts',
      'apps/extension/src/background/capture/routing/web-snapshot-asset-route.test.ts',
    ],
  },
  {
    owner: 'web-snapshot-background-transfer',
    productionFile: 'apps/extension/src/background/capture/routing/types.ts',
    reason: 'Capture route staged web snapshot typing is covered by focused route tests.',
    testFiles: [
      'apps/extension/src/background/capture/routing/route/dispatcher.test.ts',
      'apps/extension/src/background/capture/routing/web-snapshot-asset-route.test.ts',
    ],
  },
  {
    owner: 'web-snapshot-runtime-routing',
    productionFile: 'apps/extension/src/background/runtime/routing/message-guards/guards/tab.ts',
    reason: 'Runtime tab guard staged web snapshot authorization is covered by guard tests.',
    testFiles: ['apps/extension/src/background/runtime/routing/message-guards/guards/tab.test.ts'],
  },
  {
    owner: 'web-snapshot-runtime-routing',
    productionFile: 'apps/extension/src/background/runtime/routing/boundary/sender-policy.ts',
    reason:
      'Runtime sender policy staged web snapshot authorization is covered by preflight tests.',
    testFiles: [
      'apps/extension/src/background/runtime/routing/boundary/preflight.web-snapshot-boundary.test.ts',
    ],
  },
  {
    owner: 'web-snapshot-runtime-routing',
    productionFile:
      'apps/extension/src/background/runtime/routing/boundary/popup-export-routing.ts',
    reason:
      'Runtime popup-export web snapshot routing is covered by focused popup-export route tests.',
    testFiles: [
      'apps/extension/src/background/runtime/routing/boundary/popup-export-routing.test.ts',
      'apps/extension/src/background/runtime/routing/boundary/popup-export-routing.viewer.test.ts',
    ],
  },
  {
    owner: 'web-snapshot-media-hub-transfer',
    productionPrefix: 'apps/extension/src/background/media-hub/web-snapshot',
    reason:
      'Media hub web snapshot staged and legacy payload persistence are covered by focused save tests.',
    testFiles: [
      'apps/extension/src/background/media-hub/web-snapshot.test.ts',
      'apps/extension/src/background/capture/routing/actions.web-snapshot.save.test.ts',
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
      'apps/extension/src/workflows/media-hub-backup/archive/web-snapshot-provenance.test.ts',
      'apps/extension/src/workflows/media-hub-backup/restore/web-snapshot.test.ts',
    ],
  },
  {
    owner: 'shared-web-snapshot-manifest-helper',
    productionFile: 'apps/extension/src/features/web-snapshot/manifest.ts',
    reason: 'Web snapshot manifest helpers are covered by save and backup egress tests.',
    testFiles: [
      'apps/extension/src/background/media-hub/web-snapshot.test.ts',
      'apps/extension/src/content/parser/web-snapshot/package.test.ts',
      'apps/extension/src/workflows/media-hub-backup/archive/web-snapshot-provenance.test.ts',
    ],
  },
];
