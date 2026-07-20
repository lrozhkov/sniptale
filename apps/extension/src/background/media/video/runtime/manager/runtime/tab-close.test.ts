import { beforeEach, expect, it, vi } from 'vitest';

const { stopRecordingMock, getVideoRecordingTabIdMock, logger } = vi.hoisted(() => ({
  stopRecordingMock: vi.fn(),
  getVideoRecordingTabIdMock: vi.fn(),
  logger: {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => logger,
}));

vi.mock('../../../session-state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../session-state')>()),
  getVideoRecordingTabId: getVideoRecordingTabIdMock,
}));

vi.mock('../controls.stop', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../controls.stop')>()),
  stopRecording: stopRecordingMock,
}));

import { handleTabClose } from './tab-close';

beforeEach(() => {
  vi.clearAllMocks();
  getVideoRecordingTabIdMock.mockReturnValue(7);
});

it('stops the recording when the active recording tab closes', () => {
  handleTabClose(3);
  handleTabClose(7);

  expect(stopRecordingMock).toHaveBeenCalledTimes(1);
  expect(logger.log).toHaveBeenCalledWith('Recording tab closed, stopping recording');
});

it('ignores unrelated tab close events', () => {
  getVideoRecordingTabIdMock.mockReturnValue(9);

  handleTabClose(7);

  expect(stopRecordingMock).not.toHaveBeenCalled();
});
