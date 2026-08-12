import { beforeEach, expect, it, vi } from 'vitest';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { createBackgroundRuntimeState } from '../../../../application/runtime-state';

const mocks = vi.hoisted(() => ({ authorize: vi.fn(), route: vi.fn() }));

vi.mock('../../authorization/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../authorization/index')>()),
  authorizeIPCMessage: mocks.authorize,
}));
vi.mock('../../../../media/video/content-surface/route', () => ({
  routeVideoRecordingSurfaceMessage: mocks.route,
}));

import { routeResolvedVideoRecordingSurfaceMessage } from './video-recording-surface-adapter';

const baseArgs = {
  deps: createBackgroundRuntimeState(),
  logger: { error: vi.fn() },
  resolvedTabId: 7,
  sendResponse: vi.fn(),
  sender: { tab: { id: 7 }, url: 'https://example.test' } as chrome.runtime.MessageSender,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authorize.mockReturnValue({ authorized: true });
});

it('ignores unrelated messages and routes an authorized surface activation', () => {
  expect(
    routeResolvedVideoRecordingSurfaceMessage({
      ...baseArgs,
      message: {
        type: VideoMessageType.PAUSE_RECORDING,
        recordingId: 'recording-1',
        controlToken: 'token-1',
      },
    })
  ).toBe(false);
  const message = {
    type: VideoMessageType.ACTIVATE_VIDEO_RECORDING_SURFACE,
    contentIntent: { requestId: 'request-1', token: 'intent-1' },
  };
  expect(routeResolvedVideoRecordingSurfaceMessage({ ...baseArgs, message })).toBe(true);
  expect(mocks.route).toHaveBeenCalledWith(
    expect.objectContaining({ message, resolvedTabId: 7, sender: baseArgs.sender })
  );
});

it('rejects an unauthorized surface sender without invoking the privileged owner', () => {
  mocks.authorize.mockReturnValue({ authorized: false, reason: 'sender rejected' });
  const sendResponse = vi.fn();
  expect(
    routeResolvedVideoRecordingSurfaceMessage({
      ...baseArgs,
      sendResponse,
      message: {
        type: VideoMessageType.ACTIVATE_VIDEO_RECORDING_SURFACE,
        contentIntent: { requestId: 'request-1', token: 'intent-1' },
      },
    })
  ).toBe(true);
  expect(sendResponse).toHaveBeenCalledWith(
    expect.objectContaining({ success: false, error: 'sender rejected' })
  );
  expect(mocks.route).not.toHaveBeenCalled();
});
