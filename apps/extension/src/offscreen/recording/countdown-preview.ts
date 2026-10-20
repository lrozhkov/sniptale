import {
  CaptureMode,
  type VideoRecordingSettings,
} from '@sniptale/runtime-contracts/video/types/types';
import {
  matchesRecordingFrameClockBinding,
  type RecordingFrameClockBinding,
} from '../../contracts/video/recording-frame-clock';
import { acquireCameraSource, type CameraSourceLease } from './camera-source/session';
import { createCameraSourcePeerOwner } from './camera-source/peer';

type PreparedPreview = {
  binding: RecordingFrameClockBinding;
  retired: boolean;
  source: MediaStream | null;
  preparation: CameraSourceLease | null;
  cancelPreparation: (() => void) | null;
  readiness: Promise<void>;
};

export function createCountdownPreviewOwner(deps: {
  acquireCamera: typeof acquireCameraSource;
  createConnection: Parameters<typeof createCameraSourcePeerOwner>[0]['createConnection'];
}) {
  let current: PreparedPreview | null = null;
  const peers = createCameraSourcePeerOwner({
    acquireSource: deps.acquireCamera,
    createConnection: deps.createConnection,
  });

  const cleanup = (): void => {
    const previous = current;
    current = null;
    if (previous) previous.retired = true;
    previous?.cancelPreparation?.();
    peers.closeAll();
    previous?.preparation?.release();
  };

  return {
    async prepare(args: {
      binding: RecordingFrameClockBinding;
      captureMode: CaptureMode;
      settings: VideoRecordingSettings;
      stream?: MediaStream | null;
    }): Promise<void> {
      cleanup();
      const readiness = Promise.withResolvers<void>();
      const target: PreparedPreview = {
        binding: args.binding,
        retired: false,
        source: null,
        preparation: null,
        cancelPreparation: null,
        readiness: readiness.promise,
      };
      current = target;
      if ('stream' in args) {
        target.source = args.stream ?? null;
        readiness.resolve();
        return;
      }
      if (args.captureMode === CaptureMode.CAMERA || !args.settings.webcamEnabled) {
        readiness.resolve();
        return;
      }
      await new Promise<void>((resolve) => {
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve();
        };
        const timer = setTimeout(finish, 2000);
        target.cancelPreparation = () => {
          readiness.resolve();
          finish();
        };
        void deps.acquireCamera(args.settings).then(
          (preparation) => {
            if (current !== target || target.retired) {
              preparation.release();
            } else {
              target.preparation = preparation;
              target.source = preparation.stream;
            }
            target.cancelPreparation = null;
            readiness.resolve();
            finish();
          },
          () => {
            target.cancelPreparation = null;
            readiness.resolve();
            finish();
          }
        );
      });
    },

    async answer(args: { binding: RecordingFrameClockBinding; peerId: string; sdp: string }) {
      const target = current;
      if (
        !target ||
        target.retired ||
        !matchesRecordingFrameClockBinding(target.binding, args.binding)
      ) {
        throw new Error('Countdown camera source is unavailable.');
      }
      return peers.answerOffer({
        peerId: args.peerId,
        offer: { type: 'offer', sdp: args.sdp },
        source: async () => {
          await target.readiness;
          if (current !== target || target.retired)
            throw new Error('Countdown camera source is unavailable.');
          const track = target.source?.getVideoTracks()[0];
          if (!track || track.readyState === 'ended')
            throw new Error('Countdown camera source is unavailable.');
          const clone = track.clone();
          return {
            stream: new MediaStream([clone]),
            release: () => clone.stop(),
            sourceLabel: null,
            trackSettings: clone.getSettings(),
          };
        },
      });
    },

    close: peers.close,

    retire(binding: RecordingFrameClockBinding): void {
      if (!current || !matchesRecordingFrameClockBinding(current.binding, binding)) return;
      current.retired = true;
      current.cancelPreparation?.();
      peers.closeAll();
    },

    release(binding: RecordingFrameClockBinding): void {
      if (!current || !matchesRecordingFrameClockBinding(current.binding, binding)) return;
      current.preparation?.release();
      current.preparation = null;
    },

    cleanup,
  };
}

const owner = createCountdownPreviewOwner({
  acquireCamera: acquireCameraSource,
  createConnection: () => new RTCPeerConnection(),
});

export const prepareCountdownCameraPreview = owner.prepare;
export const answerCountdownCameraOffer = owner.answer;
export const closeCountdownCameraPeer = owner.close;
export const retireCountdownCameraPeers = owner.retire;
export const releaseCountdownCameraPreparation = owner.release;
export const cleanupCountdownCameraPreview = owner.cleanup;
