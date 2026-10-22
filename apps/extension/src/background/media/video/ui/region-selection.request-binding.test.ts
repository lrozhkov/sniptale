import { beforeEach, expect, it, vi } from 'vitest';

import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';

const browserTabsGet = vi.hoisted(() => vi.fn());

vi.mock('@sniptale/platform/browser/tabs', () => ({
  browserTabs: { get: browserTabsGet },
}));

import {
  createRegionSelectionRequestBinding,
  isRegionSelectionResultForRequest,
  isRegionSelectionSenderForRequest,
  toShowRegionSelectorMessage,
  type RegionSelectionRequestBinding,
} from './region-selection.request-binding';

const TOKEN = '11111111-1111-4111-8111-111111111111';
const GENERATION = '22222222-2222-4222-8222-222222222222';
const REQUEST_ID = '33333333-3333-4333-8333-333333333333';

beforeEach(() => {
  vi.restoreAllMocks();
  browserTabsGet.mockReset();
});

function createBinding(
  overrides: Partial<RegionSelectionRequestBinding> = {}
): RegionSelectionRequestBinding {
  return {
    regionSelectionCapabilityToken: TOKEN,
    regionSelectionRequestGeneration: GENERATION,
    regionSelectionRequestId: REQUEST_ID,
    expiresAtMs: 1700000060000,
    frameId: 0,
    senderUrl: 'https://example.com/page',
    tabId: 42,
    ...overrides,
  };
}

it('creates tab-url-bound region selection request messages', async () => {
  const randomUuid = vi
    .spyOn(globalThis.crypto, 'randomUUID')
    .mockReturnValueOnce(TOKEN)
    .mockReturnValueOnce(GENERATION)
    .mockReturnValueOnce(REQUEST_ID);
  browserTabsGet.mockResolvedValue({ url: 'https://example.com/page' });

  const binding = await createRegionSelectionRequestBinding(42, 1700000000000);

  expect(binding).toEqual(createBinding());
  expect(randomUuid).toHaveBeenCalledTimes(3);
  expect(toShowRegionSelectorMessage(binding)).toEqual({
    type: VideoMessageType.SHOW_REGION_SELECTOR,
    regionSelectionCapabilityToken: TOKEN,
    regionSelectionRequestGeneration: GENERATION,
    regionSelectionRequestId: REQUEST_ID,
  });
});

it('falls back to token-only binding when tab URL lookup fails', async () => {
  vi.spyOn(globalThis.crypto, 'randomUUID')
    .mockReturnValueOnce(TOKEN)
    .mockReturnValueOnce(GENERATION)
    .mockReturnValueOnce(REQUEST_ID);
  browserTabsGet.mockRejectedValue(new Error('tab closed'));

  await expect(createRegionSelectionRequestBinding(42, 1700000000000)).resolves.toEqual({
    regionSelectionCapabilityToken: TOKEN,
    regionSelectionRequestGeneration: GENERATION,
    regionSelectionRequestId: REQUEST_ID,
    expiresAtMs: 1700000060000,
    frameId: 0,
    tabId: 42,
  });
});

it('matches result bindings, expiry, and exact senders', () => {
  const binding = createBinding({ documentId: 'doc-1' });
  const message = {
    type: VideoMessageType.REGION_SELECTION_CANCELLED,
    regionSelectionCapabilityToken: TOKEN,
    regionSelectionRequestGeneration: GENERATION,
    regionSelectionRequestId: REQUEST_ID,
  };
  const sender = {
    documentId: 'doc-1',
    frameId: 0,
    tab: { id: 42 } as chrome.tabs.Tab,
    url: 'https://example.com/page',
  } as chrome.runtime.MessageSender;

  expect(isRegionSelectionResultForRequest(message, binding, 1700000060000)).toBe(true);
  expect(isRegionSelectionResultForRequest(message, binding, 1700000060001)).toBe(false);
  expect(isRegionSelectionSenderForRequest(sender, binding)).toBe(true);
  expect(isRegionSelectionSenderForRequest({ ...sender, documentId: 'doc-2' }, binding)).toBe(
    false
  );
  expect(isRegionSelectionSenderForRequest({ ...sender, frameId: 1 }, binding)).toBe(false);
  expect(
    isRegionSelectionSenderForRequest({ ...sender, url: 'https://evil.example/' }, binding)
  ).toBe(false);
});
