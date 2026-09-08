import { expect, it, vi } from 'vitest';
import {
  requestBoundOffscreenRecordingStop,
  RecordingStartCleanupFailure,
  requiresRecordingAuthorityRetention,
} from './offscreen-recording-stop';

const binding = { recordingId: 'recording', generation: 3, streamInstanceId: 'stream' };
const transform = {
  viewport: {
    width: 1000,
    height: 800,
    devicePixelRatio: 1,
    visualViewportScale: 1,
    visualViewportOffsetX: 0,
    visualViewportOffsetY: 0,
  },
  visibleClientRect: { x: 0, y: 0, width: 1000, height: 800 },
  scaleX: 0.001,
  scaleY: 0.00125,
  offsetX: 0,
  offsetY: 0,
};

it.each([false, true])(
  'keeps bound stop geometry only when saving, discard=%s',
  async (discard) => {
    const sendRuntimeMessage = vi
      .fn()
      .mockResolvedValue({ success: true, result: 'stopped', recordingPointTransform: transform });
    const result = await requestBoundOffscreenRecordingStop(binding, discard, {
      sendRuntimeMessage,
    });
    expect(sendRuntimeMessage).toHaveBeenCalledWith(
      expect.objectContaining({ ...binding, discard, type: 'OFFSCREEN_STOP_RECORDING' })
    );
    expect(result).toEqual({
      terminalError: null,
      recordingPointTransform: discard ? null : transform,
    });
  }
);

it.each([
  { success: true, result: 'stopped' },
  { success: true, result: 'stopped', recordingPointTransform: { ...transform, scaleX: Infinity } },
  {
    success: true,
    result: 'terminal-failure',
    error: 'Encoder failed',
    recordingPointTransform: transform,
  },
  { success: true, result: 'terminal-failure' },
])('does not publish unverified or terminal geometry: %j', async (response) => {
  const result = await requestBoundOffscreenRecordingStop(binding, false, {
    sendRuntimeMessage: vi.fn().mockResolvedValue(response),
  });
  expect(result.recordingPointTransform).toBeNull();
  expect(result.terminalError).toBe(
    response.result === 'terminal-failure'
      ? 'error' in response
        ? response.error
        : 'The recording stopped after a terminal recorder failure'
      : null
  );
});

it.each([undefined, { success: false, error: 'No recorder' }])(
  'rejects unacknowledged bound stops: %j',
  async (response) => {
    await expect(
      requestBoundOffscreenRecordingStop(binding, false, {
        sendRuntimeMessage: vi.fn().mockResolvedValue(response),
      })
    ).rejects.toThrow();
  }
);

it('retains recording authority only for an unacknowledged cleanup and preserves both failures', () => {
  const primary = new Error('Source initialization failed');
  const cleanup = new Error('Bound stop was not acknowledged');
  const failure = new RecordingStartCleanupFailure(primary, cleanup);
  expect(requiresRecordingAuthorityRetention(failure)).toBe(true);
  expect(failure.errors).toEqual([primary, cleanup]);
  expect(failure.primaryError).toBe(primary);
  expect(failure.cleanupError).toBe(cleanup);
  expect(requiresRecordingAuthorityRetention(primary)).toBe(false);
});
