import { expect, it, vi } from 'vitest';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { isRecordingClockTiming } from '../../contracts/video/recording-frame-clock';
import { buildOffscreenCommandResponse } from './command-response';
import { handleOffscreenRuntimeMessage } from './routing';
const mocks = vi.hoisted(() => ({ timing: vi.fn(), events: vi.fn(), cursor: vi.fn() }));
vi.mock('../recording/controller', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../recording/controller')>()),
  getRecordingClockTiming: mocks.timing,
  appendRecordingEventObservations: mocks.events,
  appendRecordingCursorObservations: mocks.cursor,
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

it('routes event observations to the bound event owner without exposing the capability', async () => {
  const clock = {
    source: 'dom-event-time' as const,
    timestampQuantumUs: null,
    resolutionBoundUs: null,
    mappingUncertaintyUs: null,
  };
  const eventPacket = {
    version: 1 as const,
    recordingId: 'r',
    batchSequence: 0,
    sourceClockId: 'phase',
    clockRevision: 0,
    clock,
    viewport: {
      width: 1280,
      height: 720,
      devicePixelRatio: 1,
      visualViewportScale: 1,
      visualViewportOffsetX: 0,
      visualViewportOffsetY: 0,
    },
    records: [
      {
        kind: 'segment' as const,
        recordSeq: 0,
        segmentId: 0,
        activeTimeUs: 0,
        clock,
        reason: 'start' as const,
      },
    ],
  };
  mocks.events.mockResolvedValue(undefined);
  const binding = { recordingId: 'r', generation: 1, streamInstanceId: 's' };
  const reply = vi.fn();
  const result = await handleOffscreenRuntimeMessage(
    {
      type: VideoMessageType.OFFSCREEN_RECORDING_OBSERVATIONS,
      ...binding,
      nativeDocumentId: 'native-document',
      eventPacket,
      capabilityToken: 'PRIVATE_CAPABILITY',
    },
    reply
  );
  expect(mocks.events).toHaveBeenCalledWith(binding, eventPacket, 'native-document');
  expect(mocks.cursor).not.toHaveBeenCalled();
  expect(reply).not.toHaveBeenCalled();
  expect(
    buildOffscreenCommandResponse(VideoMessageType.OFFSCREEN_RECORDING_OBSERVATIONS, result)
  ).toEqual({ success: true, result: 'accepted' });
});
