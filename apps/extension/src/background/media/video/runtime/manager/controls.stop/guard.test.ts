import { beforeEach, expect, it, vi } from 'vitest';

const {
  getVideoRecordingCountdownSessionIdMock,
  hasActiveVideoRecordingSessionMock,
  isVideoRecordingPreparationInProgressMock,
  isVideoRecordingStopInProgressMock,
  logger,
} = vi.hoisted(() => ({
  getVideoRecordingCountdownSessionIdMock: vi.fn(),
  hasActiveVideoRecordingSessionMock: vi.fn(),
  isVideoRecordingPreparationInProgressMock: vi.fn(),
  isVideoRecordingStopInProgressMock: vi.fn(),
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
  getVideoRecordingCountdownSessionId: getVideoRecordingCountdownSessionIdMock,
  hasActiveVideoRecordingSession: hasActiveVideoRecordingSessionMock,
  isVideoRecordingPreparationInProgress: isVideoRecordingPreparationInProgressMock,
  isVideoRecordingStopInProgress: isVideoRecordingStopInProgressMock,
}));

import { shouldSkipStop } from './guard';

beforeEach(() => {
  vi.clearAllMocks();
  getVideoRecordingCountdownSessionIdMock.mockReturnValue(null);
  hasActiveVideoRecordingSessionMock.mockReturnValue(true);
  isVideoRecordingPreparationInProgressMock.mockReturnValue(false);
  isVideoRecordingStopInProgressMock.mockReturnValue(false);
});

it('ignores stop requests while stop is already in progress', () => {
  isVideoRecordingStopInProgressMock.mockReturnValue(true);

  expect(shouldSkipStop()).toBe(true);
  expect(logger.warn).toHaveBeenCalledWith(
    'Ignoring duplicate stop request while stop is already in progress'
  );
});

it('ignores stop requests when no recording session is active', () => {
  hasActiveVideoRecordingSessionMock.mockReturnValue(false);

  expect(shouldSkipStop()).toBe(true);
  expect(logger.warn).toHaveBeenCalledWith('Ignoring stop request because no recording is active');
});

it('allows stop requests when a recording or countdown session is active', () => {
  hasActiveVideoRecordingSessionMock.mockReturnValue(false);
  getVideoRecordingCountdownSessionIdMock.mockReturnValue('countdown-1');

  expect(shouldSkipStop()).toBe(false);
  expect(logger.warn).not.toHaveBeenCalled();
});
