import { beforeEach, expect, it, vi } from 'vitest';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { admitPreparedRecordingSource } from './source-admission';

const mocks = vi.hoisted(() => ({
  preview: vi.fn(),
  retire: vi.fn(),
  begin: vi.fn(),
  cleanup: vi.fn(),
  send: vi.fn(),
  context: {
    currentRecordingId: 'recording',
    lifecycleState: 'starting',
    sourceStream: null as MediaStream | null,
  },
}));

vi.mock('../countdown-preview', () => ({
  prepareCountdownCameraPreview: mocks.preview,
  retireCountdownCameraPeers: mocks.retire,
}));
vi.mock('../context', () => ({ recordingContext: mocks.context }));
vi.mock('./cleanup', () => ({ cleanupResources: mocks.cleanup }));
vi.mock('./gate', () => ({ waitForRecordingBegin: mocks.begin }));

const binding = { recordingId: 'recording', generation: 1, streamInstanceId: 'stream' };
const prepared = {
  rawVideoWidth: 1280,
  rawVideoHeight: 720,
  rawTrackSettings: { width: 1280, height: 720, frameRate: 30 },
};
const args = { binding, captureMode: CaptureMode.TAB, settings: DEFAULT_VIDEO_SETTINGS, prepared };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.context.currentRecordingId = 'recording';
  mocks.context.lifecycleState = 'starting';
  mocks.context.sourceStream = null;
  mocks.preview.mockResolvedValue(undefined);
  mocks.begin.mockResolvedValue(undefined);
  mocks.send.mockResolvedValue({ success: true, result: 'ALLOW' });
});

async function flush() {
  for (let index = 0; index < 6; index += 1) await Promise.resolve();
}

it('admits prepared source dimensions and waits for BEGIN before retiring peers', async () => {
  const begin = Promise.withResolvers<void>();
  mocks.begin.mockReturnValue(begin.promise);
  const admission = admitPreparedRecordingSource(args, { sendRuntimeMessage: mocks.send });
  await flush();
  expect(mocks.send).toHaveBeenCalledWith({
    type: VideoMessageType.OFFSCREEN_SOURCE_READY,
    ...binding,
    videoWidth: 1280,
    videoHeight: 720,
    trackSettings: { width: 1280, height: 720, frameRate: 30 },
  });
  expect(mocks.retire).not.toHaveBeenCalled();
  begin.resolve();
  await expect(admission).resolves.toBe(true);
  expect(mocks.retire).toHaveBeenCalledExactlyOnceWith(binding);
  expect(mocks.cleanup).not.toHaveBeenCalled();
});

it('prepares CAMERA preview from the recording-owned source', async () => {
  await expect(
    admitPreparedRecordingSource(
      { ...args, captureMode: CaptureMode.CAMERA },
      { sendRuntimeMessage: mocks.send }
    )
  ).resolves.toBe(true);
  expect(mocks.preview).toHaveBeenCalledWith({
    binding,
    captureMode: CaptureMode.CAMERA,
    settings: DEFAULT_VIDEO_SETTINGS,
    stream: null,
  });
});

it('cleans up cancelled preview preparation without publishing readiness', async () => {
  const preparation = Promise.withResolvers<void>();
  mocks.preview.mockReturnValue(preparation.promise);
  const admission = admitPreparedRecordingSource(args, { sendRuntimeMessage: mocks.send });
  mocks.context.currentRecordingId = 'replacement';
  preparation.resolve();
  await expect(admission).resolves.toBe(false);
  expect(mocks.cleanup).toHaveBeenCalledOnce();
  expect(mocks.begin).not.toHaveBeenCalled();
  expect(mocks.send).not.toHaveBeenCalled();
});

it.each(['denied', 'transport'] as const)(
  'cancels and observes pending BEGIN when source admission is %s',
  async (failure) => {
    const begin = Promise.withResolvers<void>();
    mocks.begin.mockReturnValue(begin.promise);
    mocks.cleanup.mockImplementation(() => begin.reject(new Error('cancelled')));
    if (failure === 'denied') mocks.send.mockResolvedValue({ success: true, result: 'DENY' });
    else mocks.send.mockRejectedValue(new Error('transport unavailable'));
    await expect(
      admitPreparedRecordingSource(args, { sendRuntimeMessage: mocks.send })
    ).rejects.toThrow(
      failure === 'denied' ? 'source-dimensions-mismatch' : 'transport unavailable'
    );
    expect(mocks.cleanup).toHaveBeenCalledOnce();
    expect(mocks.retire).not.toHaveBeenCalled();
  }
);

it('cleans up a start cancelled while awaiting BEGIN', async () => {
  const begin = Promise.withResolvers<void>();
  mocks.begin.mockReturnValue(begin.promise);
  const admission = admitPreparedRecordingSource(args, { sendRuntimeMessage: mocks.send });
  await flush();
  mocks.context.lifecycleState = 'stopping';
  begin.resolve();
  await expect(admission).resolves.toBe(false);
  expect(mocks.retire).toHaveBeenCalledWith(binding);
  expect(mocks.cleanup).toHaveBeenCalledOnce();
});
