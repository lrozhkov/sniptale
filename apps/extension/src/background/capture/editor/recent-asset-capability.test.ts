import { beforeEach, expect, it } from 'vitest';
import {
  clearRecentCaptureEditorAssetCapabilitiesForTab,
  consumeRecentCaptureEditorAssetCapability,
  issueRecentCaptureEditorAssetCapability,
  resetRecentCaptureEditorAssetCapabilitiesForTests,
} from './recent-asset-capability';

const senderBinding = {
  documentId: 'document-1',
  frameId: 0,
  senderUrl: 'https://example.test/page',
  tabId: 7,
};

beforeEach(() => {
  resetRecentCaptureEditorAssetCapabilitiesForTests();
});

function issue(assetId: string, requestId: string, tabId = 7) {
  return issueRecentCaptureEditorAssetCapability({
    assetId,
    nowEpochMs: 1_000,
    requestId,
    senderBinding: { ...senderBinding, tabId },
  });
}

it('keeps parallel capture bindings for the same tab independently consumable', () => {
  const first = issue('asset-1', 'request-1');
  const second = issue('asset-2', 'request-2');

  expect(
    consumeRecentCaptureEditorAssetCapability({
      assetId: 'asset-1',
      capability: first,
      nowEpochMs: 2_000,
      senderBinding,
    })
  ).toBe(true);
  expect(
    consumeRecentCaptureEditorAssetCapability({
      assetId: 'asset-2',
      capability: second,
      nowEpochMs: 2_000,
      senderBinding,
    })
  ).toBe(true);
});

it('consumes an accepted capability only once', () => {
  const capability = issue('asset-1', 'request-1');
  const consume = () =>
    consumeRecentCaptureEditorAssetCapability({
      assetId: 'asset-1',
      capability,
      nowEpochMs: 2_000,
      senderBinding,
    });

  expect(consume()).toBe(true);
  expect(consume()).toBe(false);
});

it('rejects expired capabilities', () => {
  const capability = issue('asset-1', 'request-1');

  expect(
    consumeRecentCaptureEditorAssetCapability({
      assetId: 'asset-1',
      capability,
      nowEpochMs: 61_000,
      senderBinding,
    })
  ).toBe(false);
});

it('fails closed when worker-local capability state is lost', () => {
  const capability = issue('asset-1', 'request-1');
  resetRecentCaptureEditorAssetCapabilitiesForTests();

  expect(
    consumeRecentCaptureEditorAssetCapability({
      assetId: 'asset-1',
      capability,
      nowEpochMs: 2_000,
      senderBinding,
    })
  ).toBe(false);
});

it('rejects replacement frame and document identities without consuming the original capability', () => {
  const capability = issue('asset-1', 'request-1');

  expect(
    consumeRecentCaptureEditorAssetCapability({
      assetId: 'asset-1',
      capability,
      nowEpochMs: 2_000,
      senderBinding: { ...senderBinding, frameId: 1 },
    })
  ).toBe(false);
  expect(
    consumeRecentCaptureEditorAssetCapability({
      assetId: 'asset-1',
      capability,
      nowEpochMs: 2_000,
      senderBinding: { ...senderBinding, documentId: 'document-2' },
    })
  ).toBe(false);
  expect(
    consumeRecentCaptureEditorAssetCapability({
      assetId: 'asset-1',
      capability,
      nowEpochMs: 2_000,
      senderBinding,
    })
  ).toBe(true);
});

it('clears only the closed tab capabilities', () => {
  const closedTabCapability = issue('asset-1', 'request-1');
  const retainedTabCapability = issue('asset-2', 'request-2', 8);
  clearRecentCaptureEditorAssetCapabilitiesForTab(7);

  expect(
    consumeRecentCaptureEditorAssetCapability({
      assetId: 'asset-1',
      capability: closedTabCapability,
      nowEpochMs: 2_000,
      senderBinding,
    })
  ).toBe(false);
  expect(
    consumeRecentCaptureEditorAssetCapability({
      assetId: 'asset-2',
      capability: retainedTabCapability,
      nowEpochMs: 2_000,
      senderBinding: { ...senderBinding, tabId: 8 },
    })
  ).toBe(true);
});

it('rejects mismatched asset and request identities without consuming a valid binding', () => {
  const capability = issue('asset-1', 'request-1');

  expect(
    consumeRecentCaptureEditorAssetCapability({
      assetId: 'asset-x',
      capability,
      nowEpochMs: 2_000,
      senderBinding,
    })
  ).toBe(false);
  expect(
    consumeRecentCaptureEditorAssetCapability({
      assetId: 'asset-1',
      capability: { ...capability, requestId: 'request-x' },
      nowEpochMs: 2_000,
      senderBinding,
    })
  ).toBe(false);
  expect(
    consumeRecentCaptureEditorAssetCapability({
      assetId: 'asset-1',
      capability,
      nowEpochMs: 2_000,
      senderBinding,
    })
  ).toBe(true);
});
