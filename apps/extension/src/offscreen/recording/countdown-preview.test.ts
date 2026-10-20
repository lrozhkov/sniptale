import { afterEach, expect, it, vi } from 'vitest';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import { createCountdownPreviewOwner } from './countdown-preview';
import { createTrackedStream, TestMediaStream } from './multi-source/media-stream.test-support';
import type { CameraSourceLease } from './camera-source/session';

const binding = { recordingId: 'recording', generation: 1, streamInstanceId: 'stream' };

class PreviewConnection extends EventTarget {
  connectionState: RTCPeerConnectionState = 'connected';
  iceGatheringState: RTCIceGatheringState = 'complete';
  localDescription: RTCSessionDescription | null = {
    type: 'answer',
    sdp: 'answer',
    toJSON: () => ({ type: 'answer', sdp: 'answer' }),
  };
  addTrack = vi.fn();
  close = vi.fn();
  createAnswer = vi.fn().mockResolvedValue({ type: 'answer', sdp: 'answer' });
  setRemoteDescription = vi.fn().mockResolvedValue(undefined);
  setLocalDescription = vi.fn().mockResolvedValue(undefined);
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('borrows primary CAMERA input and stops only preview clones on BEGIN', async () => {
  vi.stubGlobal('MediaStream', TestMediaStream);
  const source = createTrackedStream();
  const acquireCamera = vi.fn();
  const connection = new PreviewConnection();
  const owner = createCountdownPreviewOwner({ acquireCamera, createConnection: () => connection });
  await owner.prepare({
    binding,
    captureMode: CaptureMode.CAMERA,
    settings: DEFAULT_VIDEO_SETTINGS,
    stream: source,
  });
  await owner.answer({ binding, peerId: 'peer', sdp: 'offer' });
  const clone = connection.addTrack.mock.calls[0]![0];
  expect(acquireCamera).not.toHaveBeenCalled();
  owner.retire(binding);
  expect(clone.stop).toHaveBeenCalledOnce();
  expect(source.track.stop).not.toHaveBeenCalled();
  await expect(owner.answer({ binding, peerId: 'late', sdp: 'offer' })).rejects.toThrow(
    'unavailable'
  );
  owner.cleanup();
  expect(source.track.stop).not.toHaveBeenCalled();
});

it('retains selected full-quality preparation through BEGIN until sidecar handoff', async () => {
  const source = createTrackedStream();
  const release = vi.fn();
  const acquireCamera = vi.fn().mockResolvedValue({ stream: source, release });
  const owner = createCountdownPreviewOwner({
    acquireCamera,
    createConnection: () => new PreviewConnection(),
  });
  const settings = {
    ...DEFAULT_VIDEO_SETTINGS,
    webcamEnabled: true,
    webcamDeviceId: 'selected-camera',
  };
  await owner.prepare({ binding, captureMode: CaptureMode.TAB, settings });
  expect(acquireCamera).toHaveBeenCalledWith(settings);
  owner.retire(binding);
  expect(release).not.toHaveBeenCalled();
  owner.release({ ...binding, generation: 2 });
  expect(release).not.toHaveBeenCalled();
  owner.release(binding);
  owner.cleanup();
  expect(release).toHaveBeenCalledOnce();
});

it.each(['timeout', 'cleanup'] as const)(
  'releases a late preparation lease after %s without blocking recording',
  async (operation) => {
    vi.useFakeTimers();
    const acquisition = Promise.withResolvers<CameraSourceLease>();
    const release = vi.fn();
    const owner = createCountdownPreviewOwner({
      acquireCamera: () => acquisition.promise,
      createConnection: () => new PreviewConnection(),
    });
    const preparing = owner.prepare({
      binding,
      captureMode: CaptureMode.TAB,
      settings: { ...DEFAULT_VIDEO_SETTINGS, webcamEnabled: true },
    });
    if (operation === 'timeout') await vi.advanceTimersByTimeAsync(2000);
    else owner.cleanup();
    await preparing;
    acquisition.resolve({
      stream: createTrackedStream(),
      release,
      sourceLabel: null,
      trackSettings: {},
    });
    await Promise.resolve();
    expect(release).toHaveBeenCalledOnce();
    await expect(owner.answer({ binding, peerId: 'late', sdp: 'offer' })).rejects.toThrow(
      'unavailable'
    );
    owner.cleanup();
  }
);

it('borrows multi-source webcam and does not reacquire an absent prepared camera', async () => {
  const acquireCamera = vi.fn();
  const owner = createCountdownPreviewOwner({
    acquireCamera,
    createConnection: () => new PreviewConnection(),
  });
  await owner.prepare({
    binding,
    captureMode: CaptureMode.SCREEN,
    settings: { ...DEFAULT_VIDEO_SETTINGS, webcamEnabled: true },
    stream: null,
  });
  await expect(owner.answer({ binding, peerId: 'peer', sdp: 'offer' })).rejects.toThrow(
    'unavailable'
  );
  expect(acquireCamera).not.toHaveBeenCalled();
  owner.cleanup();
});

it('makes source failure advisory and refuses stale recording bindings', async () => {
  const owner = createCountdownPreviewOwner({
    acquireCamera: vi.fn().mockRejectedValue(new Error('denied')),
    createConnection: () => new PreviewConnection(),
  });
  await expect(
    owner.prepare({
      binding,
      captureMode: CaptureMode.TAB,
      settings: { ...DEFAULT_VIDEO_SETTINGS, webcamEnabled: true },
    })
  ).resolves.toBeUndefined();
  await expect(
    owner.answer({ binding: { ...binding, recordingId: 'other' }, peerId: 'peer', sdp: 'offer' })
  ).rejects.toThrow('unavailable');
  owner.cleanup();
});
