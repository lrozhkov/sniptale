import { beforeEach, expect, it, vi } from 'vitest';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';

const { shouldRefreshViewportRecordingAfterNavigationMock } = vi.hoisted(() => ({
  shouldRefreshViewportRecordingAfterNavigationMock: vi.fn(),
}));

vi.mock('../../../navigation', () => ({
  shouldRefreshViewportRecordingAfterNavigation: shouldRefreshViewportRecordingAfterNavigationMock,
}));

import { isViewportRecordingNavigationTab } from './guard';
import { videoManagerSession } from '../../../manager/session';

beforeEach(() => {
  vi.clearAllMocks();
  videoManagerSession.recordingTabId = 7;
  videoManagerSession.currentCaptureMode = CaptureMode.VIEWPORT_EMULATION;
  shouldRefreshViewportRecordingAfterNavigationMock.mockImplementation(
    (tabId: number, recordingTabId: number | null, currentCaptureMode: CaptureMode | null) =>
      tabId === recordingTabId && currentCaptureMode === CaptureMode.VIEWPORT_EMULATION
  );
});

it('matches only the active viewport recording tab', () => {
  expect(isViewportRecordingNavigationTab(7)).toBe(true);
  expect(isViewportRecordingNavigationTab(3)).toBe(false);
});

it('returns false when the shared navigation guard rejects the tab', () => {
  shouldRefreshViewportRecordingAfterNavigationMock.mockReturnValue(false);

  expect(isViewportRecordingNavigationTab(7)).toBe(false);
});
