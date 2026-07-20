import { beforeEach, expect, it, vi } from 'vitest';

import { FakeRuntimeMessagingTransport } from '../../../../platform/runtime-messaging/fake';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import { resolveCaptureSource } from './preflight.resolve';

function createChromeTab(): chrome.tabs.Tab {
  return {
    active: true,
    autoDiscardable: true,
    discarded: false,
    frozen: false,
    groupId: -1,
    highlighted: true,
    id: 7,
    incognito: false,
    index: 0,
    pinned: false,
    selected: true,
    windowId: 1,
  };
}

function createResolveCaptureSourceDeps() {
  const transport = new FakeRuntimeMessagingTransport();
  return {
    ensureOffscreenDocumentReady: vi.fn(),
    getCaptureSource: vi.fn(),
    localize: vi.fn((key: string) => key),
    logger: { debug: vi.fn(), log: vi.fn(), warn: vi.fn() },
    notifyStartFailed: vi.fn(),
    requestDesktopMedia: vi.fn(),
    requestDisplayMediaSource: vi
      .fn()
      .mockResolvedValueOnce({ label: 'Window 1' })
      .mockRejectedValueOnce(new Error('getUserMedia failed')),
    requestRegionSelection: vi.fn(),
    sendRuntimeMessage: transport.sendRuntimeMessage.bind(transport),
    transport,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

it('reports preparation failure separately from picker cancellation', async () => {
  const deps = createResolveCaptureSourceDeps();

  await expect(
    resolveCaptureSource(
      {
        captureMode: CaptureMode.SCREEN,
        sourceCount: 2,
        tab: createChromeTab(),
        tabId: 7,
      },
      deps
    )
  ).resolves.toBeNull();

  expect(deps.transport.runtimeRequests).toContainEqual(
    expect.objectContaining({
      type: 'DISPOSE_DESKTOP_MEDIA',
      capabilityToken: expect.any(String),
    })
  );
  expect(deps.notifyStartFailed).toHaveBeenCalledWith('background.runtime.sourcePreparationFailed');
});
