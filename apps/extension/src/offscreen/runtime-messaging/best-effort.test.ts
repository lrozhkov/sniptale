import { beforeEach, describe, expect, it, vi } from 'vitest';

const { loggerDebugMock, sendRuntimeMessageMock } = vi.hoisted(() => ({
  loggerDebugMock: vi.fn(),
  sendRuntimeMessageMock: vi.fn(),
}));

vi.mock('../../platform/runtime-messaging/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/runtime-messaging/index')>()),
  sendRuntimeMessage: sendRuntimeMessageMock,
}));

import {
  logOffscreenDebugError,
  sendRuntimeMessageBestEffort,
  stringifyOffscreenError,
} from './best-effort';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';

describe('offscreen-best-effort-runtime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('stringifies non-Error values for low-noise debug traces', () => {
    expect(stringifyOffscreenError('popup closed')).toBe('popup closed');
    expect(stringifyOffscreenError({ reason: 'offline' })).toBe('[object Object]');
  });

  it('logs best-effort runtime messaging failures with merged context', async () => {
    sendRuntimeMessageMock.mockRejectedValueOnce('popup closed');

    sendRuntimeMessageBestEffort({
      context: { jobId: 'job-1' },
      logger: { debug: loggerDebugMock },
      logMessage: 'Failed to notify runtime',
      payload: { type: VideoMessageType.OFFSCREEN_RECORDING_STARTED, recordingId: 'rec-1' },
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(sendRuntimeMessageMock).toHaveBeenCalledWith({
      type: VideoMessageType.OFFSCREEN_RECORDING_STARTED,
      recordingId: 'rec-1',
    });
    expect(loggerDebugMock).toHaveBeenCalledWith(
      'Failed to notify runtime',
      expect.objectContaining({
        errorMessage: 'popup closed',
        jobId: 'job-1',
      })
    );
  });

  it('logs ad hoc debug errors even without extra context', () => {
    logOffscreenDebugError({ debug: loggerDebugMock }, 'Ignored error', new Error('boom'));

    expect(loggerDebugMock).toHaveBeenCalledWith(
      'Ignored error',
      expect.objectContaining({
        errorMessage: 'boom',
      })
    );
  });
});
