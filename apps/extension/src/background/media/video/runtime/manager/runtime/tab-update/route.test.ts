import { beforeEach, expect, it, vi } from 'vitest';

const {
  handleControlledCursorNavigationStartMock,
  handleControlledCursorTabUpdateMock,
  getVideoRecordingTabIdMock,
  handleViewportRecordingTabUpdateMock,
  maybeRestoreCropOverlayAfterCompleteMock,
} = vi.hoisted(() => ({
  handleControlledCursorNavigationStartMock: vi.fn(),
  handleControlledCursorTabUpdateMock: vi.fn(),
  getVideoRecordingTabIdMock: vi.fn(),
  handleViewportRecordingTabUpdateMock: vi.fn(),
  maybeRestoreCropOverlayAfterCompleteMock: vi.fn(),
}));

vi.mock('../../../../session-state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../session-state')>()),
  getVideoRecordingTabId: getVideoRecordingTabIdMock,
}));

vi.mock('../../viewport-navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../viewport-navigation')>()),
  handleViewportRecordingTabUpdate: handleViewportRecordingTabUpdateMock,
}));

vi.mock('../../controlled-cursor/navigation', () => ({
  handleControlledCursorNavigationStart: handleControlledCursorNavigationStartMock,
  handleControlledCursorTabUpdate: handleControlledCursorTabUpdateMock,
}));

vi.mock('./crop-overlay', () => ({
  maybeRestoreCropOverlayAfterComplete: maybeRestoreCropOverlayAfterCompleteMock,
}));

import { handleTabUpdated } from './route';

beforeEach(() => {
  vi.clearAllMocks();
  getVideoRecordingTabIdMock.mockReturnValue(7);
  handleViewportRecordingTabUpdateMock.mockReturnValue(false);
  handleControlledCursorTabUpdateMock.mockReturnValue(false);
});

it('routes loading updates to viewport navigation before crop overlay restore', () => {
  handleTabUpdated(7, { status: 'loading' });

  expect(handleViewportRecordingTabUpdateMock).toHaveBeenCalledWith(7, 'loading');
  expect(handleControlledCursorTabUpdateMock).toHaveBeenCalledWith(7, 'loading');
  expect(maybeRestoreCropOverlayAfterCompleteMock).not.toHaveBeenCalled();
});

it('restores crop overlay on completed updates when viewport navigation did not handle them', () => {
  handleTabUpdated(7, { status: 'complete' });

  expect(maybeRestoreCropOverlayAfterCompleteMock).toHaveBeenCalledWith(7);
});

it('skips unrelated tabs and already-handled viewport updates', () => {
  getVideoRecordingTabIdMock.mockReturnValue(9);
  handleTabUpdated(7, { status: 'complete' });
  handleViewportRecordingTabUpdateMock.mockReturnValue(true);
  handleTabUpdated(9, { status: 'complete' });

  expect(maybeRestoreCropOverlayAfterCompleteMock).not.toHaveBeenCalled();
});

it('stops at the dedicated controlled cursor handler before crop overlay restore', () => {
  handleControlledCursorTabUpdateMock.mockReturnValue(true);

  handleTabUpdated(7, { status: 'complete' });

  expect(maybeRestoreCropOverlayAfterCompleteMock).not.toHaveBeenCalled();
});
