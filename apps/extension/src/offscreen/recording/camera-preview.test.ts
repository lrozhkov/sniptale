import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TestMediaStream, createTrackedStream } from './multi-source/media-stream.test-support';
import { acquireRecordingPreviewSource } from './camera-preview';

import { recordingContext } from './context';
import { answerRecordingCameraOffer, cleanupRecordingCameraPreview } from './camera-preview';
import { cleanupCountdownCameraPreview } from './countdown-preview';

afterEach(() => {
  cleanupRecordingCameraPreview();
  recordingContext.sourceStream = null;
  vi.restoreAllMocks();
});

const source = { recordingId: 'rec', generation: 1, streamInstanceId: 'stream', cameraOnly: true };
beforeEach(() => vi.stubGlobal('MediaStream', TestMediaStream));
function dependencies() {
  return {
    context: {
      matchesSourceBinding: vi.fn(() => true),
      lifecycleState: 'recording' as const,
      sourceStream: createTrackedStream(),
    },
    acquireCurrent: vi.fn(),
  };
}
it('clones the current camera recording track and releases only the preview', async () => {
  const deps = dependencies();
  const lease = await acquireRecordingPreviewSource(source, deps);
  expect(deps.acquireCurrent).not.toHaveBeenCalled();
  expect(lease.stream.getVideoTracks()[0]).not.toBe(deps.context.sourceStream.track);
  lease.release();
  expect(deps.context.sourceStream.track.stop).not.toHaveBeenCalled();
});
it('rejects stale recording binding before acquiring any source', async () => {
  const deps = dependencies();
  deps.context.matchesSourceBinding.mockReturnValue(false);
  await expect(acquireRecordingPreviewSource(source, deps)).rejects.toThrow('unavailable');
  expect(deps.acquireCurrent).not.toHaveBeenCalled();
});
it('releases a webcam lease if the source binding changes during acquisition', async () => {
  const deps = dependencies();
  const release = vi.fn();
  deps.acquireCurrent.mockImplementation(async () => {
    deps.context.matchesSourceBinding.mockReturnValue(false);
    return { release };
  });
  await expect(
    acquireRecordingPreviewSource({ ...source, cameraOnly: false }, deps)
  ).rejects.toThrow('unavailable');
  expect(release).toHaveBeenCalledOnce();
});
it('does not reopen an absent webcam source', async () => {
  const deps = dependencies();
  deps.acquireCurrent.mockRejectedValue(new Error('Camera source is not active.'));
  await expect(
    acquireRecordingPreviewSource({ ...source, cameraOnly: false }, deps)
  ).rejects.toThrow('not active');
  expect(deps.acquireCurrent).toHaveBeenCalledOnce();
});

it('recording cleanup closes the camera preview peer and stops its cloned track', async () => {
  const raw = createTrackedStream();
  recordingContext.sourceStream = raw;
  vi.spyOn(recordingContext, 'matchesSourceBinding').mockReturnValue(true);
  vi.spyOn(recordingContext, 'lifecycleState', 'get').mockReturnValue('recording');
  const addTrack = vi.fn();
  const close = vi.fn();
  class Peer extends EventTarget {
    connectionState = 'connected';
    iceGatheringState = 'complete';
    localDescription = { sdp: 'answer', type: 'answer' };
    addTrack = addTrack;
    close = close;
    createAnswer = async () => ({ sdp: 'answer', type: 'answer' });
    setLocalDescription = async () => undefined;
    setRemoteDescription = async () => undefined;
  }
  vi.stubGlobal('RTCPeerConnection', Peer);
  await answerRecordingCameraOffer({ source, peerId: 'recording-preview:peer', sdp: 'offer' });
  const previewTrack: MediaStreamTrack = addTrack.mock.calls[0]![0];
  cleanupCountdownCameraPreview();
  expect(close).toHaveBeenCalledOnce();
  expect(previewTrack.stop).toHaveBeenCalledOnce();
  expect(raw.track.stop).not.toHaveBeenCalled();
});
