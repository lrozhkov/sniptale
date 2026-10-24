import { recordingContext } from './context';
import { acquireCurrentCameraSource, type CameraSourceLease } from './camera-source/session';
import { createCameraSourcePeerOwner } from './camera-source/peer';
import type { RecordingFrameClockBinding } from '../../contracts/video/recording-frame-clock';

type PreviewSource = RecordingFrameClockBinding & { cameraOnly: boolean };

export async function acquireRecordingPreviewSource(
  source: PreviewSource,
  deps: {
    context: Pick<
      typeof recordingContext,
      'matchesSourceBinding' | 'lifecycleState' | 'sourceStream'
    >;
    acquireCurrent: typeof acquireCurrentCameraSource;
  } = { context: recordingContext, acquireCurrent: acquireCurrentCameraSource }
): Promise<CameraSourceLease> {
  if (!deps.context.matchesSourceBinding(source) || deps.context.lifecycleState !== 'recording') {
    return Promise.reject(new Error('Recording camera source is unavailable.'));
  }
  if (!source.cameraOnly) {
    const lease = await deps.acquireCurrent();
    if (!deps.context.matchesSourceBinding(source) || deps.context.lifecycleState !== 'recording') {
      lease.release();
      throw new Error('Recording camera source is unavailable.');
    }
    return lease;
  }
  const track = deps.context.sourceStream?.getVideoTracks()[0];
  if (!track || track.readyState === 'ended' || !track.enabled) {
    return Promise.reject(new Error('Recording camera source is unavailable.'));
  }
  const clone = track.clone();
  return Promise.resolve({
    stream: new MediaStream([clone]),
    release: () => clone.stop(),
    sourceLabel: null,
    trackSettings: clone.getSettings(),
  });
}

const peers = createCameraSourcePeerOwner({
  acquireSource: acquireCurrentCameraSource,
  createConnection: () => new RTCPeerConnection(),
});

export const closeRecordingCameraPeer = peers.close;
export const cleanupRecordingCameraPreview = peers.closeAll;

export function answerRecordingCameraOffer(args: {
  source: PreviewSource;
  peerId: string;
  sdp: string;
}) {
  return peers.answerOffer({
    peerId: args.peerId,
    offer: { type: 'offer', sdp: args.sdp },
    source: () => acquireRecordingPreviewSource(args.source),
  });
}
