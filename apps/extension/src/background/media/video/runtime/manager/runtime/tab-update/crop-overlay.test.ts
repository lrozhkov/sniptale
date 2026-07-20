import { beforeEach, expect, it, vi } from 'vitest';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';

const {
  getVideoRecordingCaptureModeMock,
  getVideoRecordingRuntimeStateMock,
  getVideoRecordingTabIdMock,
  restoreRecordingOverlayAfterNavigationMock,
  shouldRestoreCropOverlayAfterNavigationMock,
} = vi.hoisted(() => ({
  getVideoRecordingCaptureModeMock: vi.fn(),
  getVideoRecordingRuntimeStateMock: vi.fn(),
  getVideoRecordingTabIdMock: vi.fn(),
  restoreRecordingOverlayAfterNavigationMock: vi.fn(),
  shouldRestoreCropOverlayAfterNavigationMock: vi.fn(),
}));

vi.mock('../../../../navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../navigation')>()),
  shouldRestoreCropOverlayAfterNavigation: shouldRestoreCropOverlayAfterNavigationMock,
}));

vi.mock('../../../../ui/overlay-restore', () => ({
  restoreRecordingOverlayAfterNavigation: restoreRecordingOverlayAfterNavigationMock,
}));

vi.mock('../../../session-state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../session-state')>()),
  getVideoRecordingRuntimeState: getVideoRecordingRuntimeStateMock,
}));

vi.mock('../../../../session-state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../session-state')>()),
  getVideoRecordingCaptureMode: getVideoRecordingCaptureModeMock,
  getVideoRecordingTabId: getVideoRecordingTabIdMock,
}));

vi.mock('../../controls.stop', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../controls.stop')>()),
  OVERLAY_RESTORE_RETRY_DELAYS_MS: [0, 250, 1000],
}));

import { maybeRestoreCropOverlayAfterComplete } from './crop-overlay';

beforeEach(() => {
  vi.clearAllMocks();
  shouldRestoreCropOverlayAfterNavigationMock.mockReturnValue(true);
  getVideoRecordingCaptureModeMock.mockReturnValue(CaptureMode.TAB_CROP);
  getVideoRecordingTabIdMock.mockReturnValue(7);
  getVideoRecordingRuntimeStateMock.mockReturnValue({
    captureSource: null,
  });
});

it('restores the crop overlay when tab crop mode has a crop region', () => {
  getVideoRecordingRuntimeStateMock.mockReturnValue({
    captureSource: {
      cropRegion: { x: 10, y: 20, width: 300, height: 200 },
    },
  });

  maybeRestoreCropOverlayAfterComplete(7);

  expect(restoreRecordingOverlayAfterNavigationMock).toHaveBeenCalledWith(
    7,
    { x: 10, y: 20, width: 300, height: 200 },
    expect.any(Function),
    [0, 250, 1000]
  );
});

it('skips restore when not in crop mode or when no crop region exists', () => {
  getVideoRecordingCaptureModeMock.mockReturnValue(CaptureMode.VIEWPORT_EMULATION);
  maybeRestoreCropOverlayAfterComplete(7);

  getVideoRecordingCaptureModeMock.mockReturnValue(CaptureMode.TAB_CROP);
  getVideoRecordingRuntimeStateMock.mockReturnValue({
    captureSource: { cropRegion: null },
  });

  maybeRestoreCropOverlayAfterComplete(7);

  expect(restoreRecordingOverlayAfterNavigationMock).not.toHaveBeenCalled();
});
