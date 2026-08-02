import { expect, it, vi } from 'vitest';
import {
  isTrustedOffscreenRuntimeSender,
  resolveOffscreenRuntimeCapabilityContext,
} from './sender-policy';

vi.mock('@sniptale/platform/browser/runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/runtime')>()),
  runtimeInfo: { getURL: (path: string) => `chrome-extension://test/${path}` },
}));

it('accepts only the exact offscreen document through a scoped capability context', () => {
  expect(
    isTrustedOffscreenRuntimeSender({
      url: 'chrome-extension://test/apps/extension/src/offscreen/offscreen.html',
    })
  ).toBe(true);
  expect(
    resolveOffscreenRuntimeCapabilityContext(
      {
        documentId: 'offscreen-doc-1',
        url: 'chrome-extension://test/apps/extension/src/offscreen/offscreen.html',
      },
      1_000
    )
  ).toEqual({
    expiresAtEpochMs: 2_000,
    origin: 'chrome-extension://test',
    scopes: ['offscreen:runtime'],
    tabId: null,
    token: 'offscreen-doc-1',
  });
});

it('rejects host pages, spoofed extension origins, and neighboring paths', () => {
  expect(
    resolveOffscreenRuntimeCapabilityContext({
      documentId: 'content-doc-1',
      url: 'https://example.test/page',
    })
  ).toBeNull();
  expect(
    resolveOffscreenRuntimeCapabilityContext({
      url: 'chrome-extension://spoof/apps/extension/src/offscreen/offscreen.html',
    })
  ).toBeNull();
  expect(
    resolveOffscreenRuntimeCapabilityContext({
      url: 'chrome-extension://test/apps/extension/src/offscreen/offscreen.html.evil',
    })
  ).toBeNull();
});
