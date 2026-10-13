import { expect, it, vi } from 'vitest';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { isRecordingClockTiming } from '../../contracts/video/recording-frame-clock';
import { handleOffscreenRuntimeMessage } from './routing';
const mocks = vi.hoisted(() => ({ timing: vi.fn() }));
vi.mock('../recording/controller', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../recording/controller')>()),
  getRecordingClockTiming: mocks.timing,
}));
it('projects a closed source binding without command capabilities or envelopes', async () => {
  const binding = { recordingId: 'r', generation: 1, streamInstanceId: 's' };
  mocks.timing.mockImplementation((value) => ({
    ...value,
    receivedAtMs: 100,
    repliedAtMs: 100.1,
    maximumUncertaintyMs: 8,
  }));
  const reply = vi.fn();
  await handleOffscreenRuntimeMessage(
    {
      type: VideoMessageType.OFFSCREEN_GET_RECORDING_CLOCK_TIMING,
      ...binding,
      capabilityToken: 'PRIVATE_CAPABILITY',
    },
    reply
  );
  expect(mocks.timing).toHaveBeenCalledWith(binding);
  expect(reply.mock.calls[0]![0].clockTiming).toSatisfy(isRecordingClockTiming);
  expect(JSON.stringify(reply.mock.calls[0]![0])).not.toContain('PRIVATE_CAPABILITY');
});
