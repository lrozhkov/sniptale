export const CAST_CLEANUP_CONTENT_OWNER_MAPPINGS = [
  {
    owner: 'content-popup-export-request-boundaries',
    productionPrefix: 'apps/extension/src/content/parser/popup-export/helpers/request/',
    reason: 'Popup export request parsing is covered by popup export helper tests.',
    testFiles: ['apps/extension/src/content/parser/popup-export/helpers/root.test.ts'],
  },
  {
    owner: 'content-popup-export-request-options',
    productionFile: 'apps/extension/src/content/parser/popup-export/helpers/request/options.ts',
    reason: 'Popup export option parsing is covered by request parser option branches.',
    testFiles: ['apps/extension/src/content/parser/popup-export/helpers/request/parse.test.ts'],
  },
  {
    owner: 'content-popup-export-request-parse',
    productionFile: 'apps/extension/src/content/parser/popup-export/helpers/request/parse.ts',
    reason: 'Popup export request parsing is covered by the focused request parser tests.',
    testFiles: ['apps/extension/src/content/parser/popup-export/helpers/request/parse.test.ts'],
  },
  {
    owner: 'content-page-snapshot-payload-boundary',
    productionFile: 'apps/extension/src/content/parser/page-snapshot/payloads/index.ts',
    reason: 'JSON-LD payload extraction and schema text parsing are covered by payload tests.',
    testFiles: ['apps/extension/src/content/parser/page-snapshot/payloads/index.test.ts'],
  },
  {
    owner: 'content-application-message-ownership-boundary',
    productionFile: 'apps/extension/src/content/application/message-listener/ownership.ts',
    reason: 'Content application message ownership filtering is covered by ownership tests.',
    testFiles: ['apps/extension/src/content/application/message-listener/ownership.test.ts'],
  },
  {
    owner: 'content-application-diagnostics-runtime-boundary',
    productionFile: 'apps/extension/src/content/application/diagnostics/runtime/logger.helpers.ts',
    reason:
      'Content diagnostic event payload handling is covered by runtime router diagnostics tests.',
    testFiles: ['apps/extension/src/background/media/video/runtime/router.diagnostics.test.ts'],
  },
  {
    owner: 'content-har-export-transport-boundary',
    productionFile: 'apps/extension/src/content/parser/export-manager/diagnostics/transport.ts',
    reason: 'HAR diagnostics transport payload parsing is covered by transport tests.',
    testFiles: ['apps/extension/src/content/parser/export-manager/diagnostics/transport.test.ts'],
  },
];
