import { beforeEach, expect, it, vi } from 'vitest';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';

const {
  setViewportRecordingDrawStateMock,
  refreshViewportRecordingAfterNavigationMock,
  shouldRefreshViewportRecordingAfterNavigationMock,
} = vi.hoisted(() => ({
  setViewportRecordingDrawStateMock: vi.fn(),
  refreshViewportRecordingAfterNavigationMock: vi.fn(),
  shouldRefreshViewportRecordingAfterNavigationMock: vi.fn(),
}));

vi.mock('../../../navigation', () => ({
  setViewportRecordingDrawState: setViewportRecordingDrawStateMock,
  refreshViewportRecordingAfterNavigation: refreshViewportRecordingAfterNavigationMock,
  shouldRefreshViewportRecordingAfterNavigation: shouldRefreshViewportRecordingAfterNavigationMock,
}));

import { handleViewportRecordingTabUpdate } from './refresh';
import { videoManagerSession } from '../../../manager/session';
import {
  resetVideoRecordingRuntimeState,
  setVideoRecordingRuntimeState,
} from '../../session-state';

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(globalThis, {
    chrome: {
      action: {
        setBadgeBackgroundColor: vi.fn(),
        setBadgeText: vi.fn(),
        setTitle: vi.fn(),
      },
      runtime: {
        sendMessage: vi.fn().mockResolvedValue(undefined),
      },
    },
  });
  videoManagerSession.recordingTabId = 7;
  videoManagerSession.currentCaptureMode = CaptureMode.VIEWPORT_EMULATION;
  videoManagerSession.viewportNavigationEpoch = 0;
  videoManagerSession.viewportNavigationPending = false;
  shouldRefreshViewportRecordingAfterNavigationMock.mockReturnValue(true);
  resetVideoRecordingRuntimeState();
});

it('freezes on loading and refreshes the current navigation epoch on complete', () => {
  setVideoRecordingRuntimeState({
    captureMode: CaptureMode.VIEWPORT_EMULATION,
    viewportPreset: {
      id: 'wide',
      label: 'Wide',
      width: 1920,
      height: 1080,
    },
  });

  handleViewportRecordingTabUpdate(7, 'loading');
  handleViewportRecordingTabUpdate(7, 'complete');

  expect(setViewportRecordingDrawStateMock).toHaveBeenCalledWith({
    frozen: true,
    navigationEpoch: 1,
  });
  expect(refreshViewportRecordingAfterNavigationMock).toHaveBeenCalledTimes(1);
});

it('does not refreeze an already pending loading navigation', () => {
  handleViewportRecordingTabUpdate(7, 'loading');
  handleViewportRecordingTabUpdate(7, 'loading');

  expect(setViewportRecordingDrawStateMock).toHaveBeenCalledTimes(1);
});

it('returns false for non-terminal statuses and skips refresh when no viewport preset exists', () => {
  expect(handleViewportRecordingTabUpdate(7, 'interactive')).toBe(false);

  setVideoRecordingRuntimeState({
    captureMode: CaptureMode.VIEWPORT_EMULATION,
    viewportPreset: null,
  });

  expect(handleViewportRecordingTabUpdate(7, 'complete')).toBe(true);
  expect(refreshViewportRecordingAfterNavigationMock).not.toHaveBeenCalled();
});

it('ignores unrelated tabs across the refresh handler', () => {
  shouldRefreshViewportRecordingAfterNavigationMock.mockReturnValue(false);

  expect(handleViewportRecordingTabUpdate(3, 'loading')).toBe(false);
  expect(refreshViewportRecordingAfterNavigationMock).not.toHaveBeenCalled();
});
