import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import {
  consumeGalleryImageUpdateCapability,
  issueGalleryImageUpdateCapability,
  resetGalleryImageUpdateCapabilitiesForTests,
} from './gallery-update-capabilities';

const capabilityBinding = {
  assetId: 'asset-1',
  documentId: 'document-1',
  editorSessionId: 'session-1',
  senderUrl:
    'chrome-extension://test/apps/extension/src/editor/index.html?assetId=asset-1&session=session-1',
};

beforeEach(() => {
  resetGalleryImageUpdateCapabilitiesForTests();
  vi.stubGlobal('crypto', { randomUUID: () => 'update-token-1' });
});

afterEach(() => {
  resetGalleryImageUpdateCapabilitiesForTests();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('consumes gallery update capabilities once for the exact editor document binding', () => {
  const token = issueGalleryImageUpdateCapability(capabilityBinding);

  expect(consumeGalleryImageUpdateCapability({ ...capabilityBinding, token })).toBe(true);
  expect(consumeGalleryImageUpdateCapability({ ...capabilityBinding, token })).toBe(false);
});

it('rejects copied and expired gallery update capabilities', () => {
  const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1_000);
  const copiedDocumentToken = issueGalleryImageUpdateCapability(capabilityBinding);

  expect(
    consumeGalleryImageUpdateCapability({
      ...capabilityBinding,
      documentId: 'document-2',
      token: copiedDocumentToken,
    })
  ).toBe(false);

  const copiedSenderToken = issueGalleryImageUpdateCapability(capabilityBinding);
  expect(
    consumeGalleryImageUpdateCapability({
      ...capabilityBinding,
      senderUrl:
        'chrome-extension://test/apps/extension/src/editor/index.html?assetId=asset-2&session=session-1',
      token: copiedSenderToken,
    })
  ).toBe(false);

  const copiedAssetToken = issueGalleryImageUpdateCapability(capabilityBinding);
  expect(
    consumeGalleryImageUpdateCapability({
      ...capabilityBinding,
      assetId: 'asset-2',
      token: copiedAssetToken,
    })
  ).toBe(false);

  const copiedSessionToken = issueGalleryImageUpdateCapability(capabilityBinding);
  expect(
    consumeGalleryImageUpdateCapability({
      ...capabilityBinding,
      editorSessionId: 'session-2',
      token: copiedSessionToken,
    })
  ).toBe(false);

  const expiredToken = issueGalleryImageUpdateCapability(capabilityBinding);
  nowSpy.mockReturnValue(1_000 + 5 * 60 * 1000 + 1);

  expect(consumeGalleryImageUpdateCapability({ ...capabilityBinding, token: expiredToken })).toBe(
    false
  );
});
