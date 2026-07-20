import { expect, it, vi } from 'vitest';
import { resolveExtensionDocumentSenderUrl } from './document-sender';

const OFFSCREEN_DOCUMENT_PATH = 'apps/extension/src/offscreen/offscreen.html';

vi.mock('@sniptale/platform/browser/runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/runtime')>()),
  runtimeInfo: {
    getURL: (path: string) => `chrome-extension://test/${path}`,
  },
}));

it('accepts the expected extension document independent of query parameters', () => {
  expect(
    resolveExtensionDocumentSenderUrl(
      {
        url: 'chrome-extension://test/apps/extension/src/offscreen/offscreen.html?ignored=true',
      },
      OFFSCREEN_DOCUMENT_PATH
    )
  ).toBe('chrome-extension://test/apps/extension/src/offscreen/offscreen.html');
});

it('rejects senders with a different extension origin or document path', () => {
  expect(
    resolveExtensionDocumentSenderUrl(
      {
        url: 'chrome-extension://spoof/apps/extension/src/offscreen/offscreen.html',
      },
      OFFSCREEN_DOCUMENT_PATH
    )
  ).toBeNull();
  expect(
    resolveExtensionDocumentSenderUrl(
      {
        url: 'chrome-extension://test/apps/extension/src/offscreen/offscreen.html.evil',
      },
      OFFSCREEN_DOCUMENT_PATH
    )
  ).toBeNull();
});

it('rejects missing and malformed sender urls', () => {
  expect(resolveExtensionDocumentSenderUrl(undefined, OFFSCREEN_DOCUMENT_PATH)).toBeNull();
  expect(resolveExtensionDocumentSenderUrl({}, OFFSCREEN_DOCUMENT_PATH)).toBeNull();
  expect(
    resolveExtensionDocumentSenderUrl({ url: 'not a url' }, OFFSCREEN_DOCUMENT_PATH)
  ).toBeNull();
});
