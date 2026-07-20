import { beforeEach, expect, it, vi } from 'vitest';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';

const { setViewportRecordingDrawStateMock, shouldRefreshViewportRecordingAfterNavigationMock } =
  vi.hoisted(() => ({
    setViewportRecordingDrawStateMock: vi.fn(),
    shouldRefreshViewportRecordingAfterNavigationMock: vi.fn(),
  }));

vi.mock('../../../navigation', () => ({
  setViewportRecordingDrawState: setViewportRecordingDrawStateMock,
  shouldRefreshViewportRecordingAfterNavigation: shouldRefreshViewportRecordingAfterNavigationMock,
}));

import {
  handleViewportRecordingDebuggerDetach,
  handleViewportRecordingNavigationStart,
} from './freeze';
import { videoManagerSession } from '../../../manager/session';

beforeEach(() => {
  vi.clearAllMocks();
  videoManagerSession.recordingTabId = 7;
  videoManagerSession.currentCaptureMode = CaptureMode.VIEWPORT_EMULATION;
  videoManagerSession.viewportNavigationEpoch = 0;
  videoManagerSession.viewportNavigationPending = false;
  shouldRefreshViewportRecordingAfterNavigationMock.mockImplementation(
    (tabId: number, recordingTabId: number | null, currentCaptureMode: CaptureMode | null) =>
      tabId === recordingTabId && currentCaptureMode === CaptureMode.VIEWPORT_EMULATION
  );
});

it('freezes the viewport draw loop when navigation starts for the active tab', () => {
  expect(handleViewportRecordingNavigationStart(7)).toBe(true);

  expect(setViewportRecordingDrawStateMock).toHaveBeenCalledWith({
    frozen: true,
    navigationEpoch: 1,
  });
});

it('freezes the viewport draw loop when debugger detaches during recording', () => {
  expect(handleViewportRecordingDebuggerDetach(7)).toBe(true);

  expect(setViewportRecordingDrawStateMock).toHaveBeenCalledWith({
    frozen: true,
    navigationEpoch: 1,
  });
});

it('does not refreeze an already pending loading navigation', () => {
  handleViewportRecordingNavigationStart(7);
  handleViewportRecordingDebuggerDetach(7);

  expect(setViewportRecordingDrawStateMock).toHaveBeenCalledTimes(1);
});

it('ignores unrelated tabs across the freeze handlers', () => {
  expect(handleViewportRecordingNavigationStart(3)).toBe(false);
  expect(handleViewportRecordingDebuggerDetach(3)).toBe(false);
  expect(setViewportRecordingDrawStateMock).not.toHaveBeenCalled();
});
