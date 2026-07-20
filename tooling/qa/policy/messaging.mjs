const TEST_FILE_PATTERN =
  /(?:\.test\.[cm]?[jt]sx?$|\.spec\.[cm]?[jt]sx?$|\.test\.helpers\.[cm]?[jt]sx?$)/u;

export { DEFAULT_RUNTIME_MESSAGING_IMPORT_BASELINE } from './messaging-default-baseline.mjs';

export const ALLOWED_DIRECT_MESSAGE_FILES = new Set([
  'packages/platform/src/observability/message-tracer/messaging.ts',
  'apps/extension/src/platform/runtime-messaging/chrome-transport.ts',
  'packages/platform/src/ports/runtime-messaging/content-runtime-shim.ts',
  'apps/extension/src/platform/runtime-messaging/index.ts',
  'tooling/test/harness/browser-mocks.chrome.ts',
]);

const ALLOWED_CHROME_STUB_FILES = new Set([
  'apps/extension/src/background/capture/quick-actions/flow/finalize.test.ts',
  'apps/extension/src/background/diagnostics/export-har-collector/index.test.ts',
  'apps/extension/src/content/parser/export-manager/diagnostics/index.test.ts',
  'apps/extension/src/design-system/design-system-parity.test.tsx',
  'apps/extension/src/editor/inspector/document-actions/compact.test.tsx',
  'apps/extension/src/editor/inspector/document-actions/index.test.tsx',
  'apps/extension/src/composition/persistence/infrastructure/browser-storage/adapters.integration.test.ts',
  'packages/platform/src/browser/tabs.test.ts',
]);

export const DEFAULT_RUNTIME_MESSAGING_IMPORT_NAMES = new Set([
  'sendRuntimeMessage',
  'sendTabMessage',
]);

export const ALLOWED_DEFAULT_RUNTIME_MESSAGING_IMPORT_FILES = new Set([
  'apps/extension/src/offscreen/runtime-messaging/best-effort.ts',
  'apps/extension/src/offscreen/runtime/bootstrap.ts',
  'apps/extension/src/popup/shell/export/runtime/default-deps.ts',
  'apps/extension/src/settings/runtime/privacy-erasure-client/transport.ts',
  'apps/extension/src/platform/runtime-messaging/index.ts',
]);

export function isAllowlistedPath(relativePath, allowlist) {
  return allowlist.has(relativePath);
}

export const MESSAGING_RULES = [
  {
    rule: 'messaging-direct-send-runtime',
    violationRule: 'messaging-direct-send',
    message:
      'Use apps/extension/src/platform/runtime-messaging/index.ts instead of direct chrome.*.sendMessage.',
    astGrepPattern: 'chrome.runtime.sendMessage($$$ARGS)',
    allow: (relativePath) =>
      isAllowlistedPath(relativePath, ALLOWED_DIRECT_MESSAGE_FILES) ||
      TEST_FILE_PATTERN.test(relativePath),
  },
  {
    rule: 'messaging-direct-send-tabs',
    violationRule: 'messaging-direct-send',
    message:
      'Use apps/extension/src/platform/runtime-messaging/index.ts instead of direct chrome.*.sendMessage.',
    astGrepPattern: 'chrome.tabs.sendMessage($$$ARGS)',
    allow: (relativePath) =>
      isAllowlistedPath(relativePath, ALLOWED_DIRECT_MESSAGE_FILES) ||
      TEST_FILE_PATTERN.test(relativePath),
  },
  {
    rule: 'messaging-chrome-stub',
    message:
      "Use FakeRuntimeMessagingTransport or injected messaging deps instead of vi.stubGlobal('chrome').",
    astGrepPattern: "vi.stubGlobal('chrome', $$$ARGS)",
    allow: (relativePath) =>
      isAllowlistedPath(relativePath, ALLOWED_CHROME_STUB_FILES) ||
      relativePath.startsWith('tooling/test/harness/'),
  },
  {
    rule: 'messaging-chrome-stub-double',
    violationRule: 'messaging-chrome-stub',
    message:
      "Use FakeRuntimeMessagingTransport or injected messaging deps instead of vi.stubGlobal('chrome').",
    astGrepPattern: 'vi.stubGlobal("chrome", $$$ARGS)',
    allow: (relativePath) =>
      isAllowlistedPath(relativePath, ALLOWED_CHROME_STUB_FILES) ||
      relativePath.startsWith('tooling/test/harness/'),
  },
];
