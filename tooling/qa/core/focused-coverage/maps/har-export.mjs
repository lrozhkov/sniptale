export const HAR_EXPORT_OWNER_MAPPINGS = [
  {
    owner: 'export-har-collector',
    productionPrefix: 'apps/extension/src/background/diagnostics/export-har-collector/',
    reason: 'HAR debugger lifecycle and capability ownership are covered by collector suites.',
    testFiles: [
      'apps/extension/src/background/diagnostics/export-har-collector/helpers.test.ts',
      'apps/extension/src/background/diagnostics/export-har-collector/privacy-erasure.test.ts',
      'apps/extension/src/background/diagnostics/export-har-collector/session-lifecycle.test.ts',
      'apps/extension/src/background/diagnostics/export-har-collector/session-state.test.ts',
      'apps/extension/src/background/diagnostics/export-har-collector/session.tab-binding.test.ts',
      'apps/extension/src/background/diagnostics/export-har-collector/session.test.ts',
      'apps/extension/src/background/diagnostics/export-har-collector/session.raw.test.ts',
    ],
  },
  {
    owner: 'capture-routing-export-actions',
    productionFile: 'apps/extension/src/background/capture/routing/actions.export.ts',
    reason: 'Export route response mapping is covered by the focused action route suite.',
    testFiles: [
      'apps/extension/src/background/capture/routing/actions.export-har-start.test.ts',
      'apps/extension/src/background/capture/routing/actions.export.test.ts',
    ],
  },
  {
    owner: 'capture-routing-export-actions',
    productionFile: 'apps/extension/src/background/capture/routing/types.ts',
    reason: 'Capture route message typing is covered by route and export action suites.',
    testFiles: [
      'apps/extension/src/background/capture/routing/actions.export.test.ts',
      'apps/extension/src/background/capture/routing/route/dispatcher.test.ts',
    ],
  },
  {
    owner: 'web-snapshot-viewer-ports',
    productionFile: 'apps/extension/src/background/capture/page-preparation/viewer-ports.ts',
    reason: 'Viewer port identity and export correlation are covered by focused port tests.',
    testFiles: ['apps/extension/src/background/capture/page-preparation/viewer-ports.test.ts'],
  },
  {
    owner: 'content-export-manager-har-transfer',
    productionFile: 'apps/extension/src/content/parser/export-manager/archive/transfer.ts',
    reason: 'HAR transfer ownership is covered by transfer success and cancellation suites.',
    testFiles: [
      'apps/extension/src/content/parser/export-manager/archive/transfer.test.ts',
      'apps/extension/src/content/parser/export-manager/archive/transfer.cancellation-boundaries.test.ts',
    ],
  },
  {
    owner: 'content-export-manager-har-runtime',
    productionFile: 'apps/extension/src/content/parser/export-manager/service/runtime.ts',
    reason: 'Export runtime HAR handle propagation is covered by focused runtime tests.',
    testFiles: ['apps/extension/src/content/parser/export-manager/service/runtime.test.ts'],
  },
  {
    owner: 'content-export-manager-har-transport',
    productionFile: 'apps/extension/src/content/parser/export-manager/diagnostics/transport.ts',
    reason: 'HAR runtime transport request/response contracts are covered by diagnostics tests.',
    testFiles: ['apps/extension/src/content/parser/export-manager/diagnostics/transport.test.ts'],
  },
  {
    owner: 'content-export-manager-har-transport',
    productionFile: 'apps/extension/src/content/parser/export-manager/diagnostics/index.ts',
    reason: 'Diagnostics facade type exports are covered by diagnostics transport consumers.',
    testFiles: ['apps/extension/src/content/parser/export-manager/diagnostics/transport.test.ts'],
  },
  {
    owner: 'runtime-action-export-contracts',
    productionFile: 'apps/extension/src/contracts/messaging/contracts/runtime/actions/export.ts',
    reason: 'Runtime action export parsers are covered by the focused contract suite.',
    testFiles: ['apps/extension/src/contracts/messaging/contracts/runtime/actions/export.test.ts'],
  },
  {
    owner: 'runtime-action-export-contracts',
    productionFile: 'apps/extension/src/contracts/messaging/contracts/runtime-message/core.ts',
    reason: 'Runtime HAR message typing is covered by action export contract tests.',
    testFiles: ['apps/extension/src/contracts/messaging/contracts/runtime/actions/export.test.ts'],
  },
  {
    owner: 'runtime-action-export-contracts',
    productionFile: 'apps/extension/src/contracts/messaging/contracts/response-types.ts',
    reason: 'HAR response payload typing is covered by action export contract tests.',
    testFiles: ['apps/extension/src/contracts/messaging/contracts/runtime/actions/export.test.ts'],
  },
];
