import type { VideoRecordingSettings } from '@sniptale/runtime-contracts/video/types/types';
import {
  buildWebcamQualityConstraints,
  resolveWebcamFrameRatePresetValue,
  resolveWebcamQualitySettings,
} from '@sniptale/runtime-contracts/video/types/webcam-quality';
import { createRecordingGeometryPlan } from '../geometry/plan';
import { resolveContainedFrame } from '../geometry/contain-frame';
import { createCanvasVideoOutput } from '../stream/canvas-video-output';
import { resolveFixedVideoFrameRate } from '../stream/frame-pump';
import { createSourceVideo, waitForSourceMetadata } from '../stream/video-source';

export type CameraSourceLease = {
  release: () => void;
  stream: MediaStream;
  trackSettings: MediaTrackSettings;
};

type CameraSourceSession = {
  closed: boolean;
  dimensions: { height: number; width: number };
  frameRate: number;
  leasedTracks: Set<MediaStreamTrack>;
  leases: number;
  output: MediaStream | null;
  raw: MediaStream;
  video: HTMLVideoElement;
};

type CameraSourceDependencies = {
  acquireRawStream: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  createVideo: (stream: MediaStream) => HTMLVideoElement;
  waitForMetadata: (video: HTMLVideoElement) => Promise<void>;
};

function buildVideoConstraints(settings: VideoRecordingSettings): MediaTrackConstraints {
  return {
    ...(settings.webcamDeviceId ? { deviceId: { exact: settings.webcamDeviceId } } : {}),
    ...buildWebcamQualityConstraints(resolveWebcamQualitySettings(settings)),
  };
}

function buildReplacementVideoConstraints(deviceId: string | null): MediaTrackConstraints {
  return deviceId ? { deviceId: { exact: deviceId } } : {};
}

function stopStream(stream: MediaStream): void {
  stream.getTracks().forEach((track) => track.stop());
}

function releaseVideo(video: HTMLVideoElement): void {
  video.pause();
  video.srcObject = null;
}

function requireVideoTrack(stream: MediaStream, message: string): MediaStreamTrack {
  const track = stream.getVideoTracks()[0];
  if (!track) throw new Error(message);
  return track;
}

function createNormalizedCameraOutput(
  target: CameraSourceSession,
  settings: VideoRecordingSettings
): MediaStream {
  const geometry = createRecordingGeometryPlan({
    frameRateCap: settings.outputProfile.frameRate,
    outputBasis: { height: target.video.videoHeight, width: target.video.videoWidth },
    resolution: settings.outputProfile.resolution,
    sourceRect: {
      x: 0,
      y: 0,
      height: target.video.videoHeight,
      width: target.video.videoWidth,
    },
  });
  target.dimensions = geometry.outputSize;
  return createCanvasVideoOutput({
    contentHint: 'motion',
    dimensions: geometry.outputSize,
    frameRate: target.frameRate,
    initializeDrawing: ({ canvas, context }) => ({
      drawLiveFrame: () => {
        const video = target.video;
        if (video.videoWidth <= 0 || video.videoHeight <= 0) return false;
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = '#000000';
        context.fillRect(0, 0, canvas.width, canvas.height);
        const source = { x: 0, y: 0, height: video.videoHeight, width: video.videoWidth };
        const destination = resolveContainedFrame(source, canvas);
        context.imageSmoothingEnabled =
          source.width !== destination.width || source.height !== destination.height;
        if (context.imageSmoothingEnabled) context.imageSmoothingQuality = 'high';
        context.drawImage(
          video,
          source.x,
          source.y,
          source.width,
          source.height,
          destination.x,
          destination.y,
          destination.width,
          destination.height
        );
        return true;
      },
    }),
    release: () => undefined,
  });
}

async function initializeCameraSourceSession(args: {
  deps: CameraSourceDependencies;
  isCurrent: () => boolean;
  settings: VideoRecordingSettings;
}): Promise<CameraSourceSession> {
  const raw = await args.deps.acquireRawStream({
    audio: false,
    video: buildVideoConstraints(args.settings),
  });
  let video: HTMLVideoElement | null = null;
  try {
    const sourceTrack = requireVideoTrack(raw, 'Camera source stream is missing a video track.');
    video = args.deps.createVideo(raw);
    await args.deps.waitForMetadata(video);
    if (!args.isCurrent()) throw new Error('Camera source initialization was superseded.');
    const quality = resolveWebcamQualitySettings(args.settings);
    const selectedFrameRate = resolveWebcamFrameRatePresetValue(quality.frameRate);
    const frameRate = resolveFixedVideoFrameRate(
      Math.min(
        selectedFrameRate ?? args.settings.outputProfile.frameRate,
        args.settings.outputProfile.frameRate
      ),
      sourceTrack.getSettings().frameRate
    );
    const target: CameraSourceSession = {
      closed: false,
      dimensions: { height: 0, width: 0 },
      frameRate,
      leasedTracks: new Set(),
      leases: 0,
      output: null,
      raw,
      video,
    };
    target.output = createNormalizedCameraOutput(target, args.settings);
    return target;
  } catch (error) {
    if (video) releaseVideo(video);
    stopStream(raw);
    throw error;
  }
}

export function createCameraSourceOwner(deps: CameraSourceDependencies) {
  let session: CameraSourceSession | null = null;
  let pendingInitialization: Promise<CameraSourceSession> | null = null;
  let generation = 0;

  const closeSession = (target: CameraSourceSession): void => {
    if (target.closed) return;
    target.closed = true;
    if (session === target) session = null;
    if (target.output) stopStream(target.output);
    stopStream(target.raw);
    releaseVideo(target.video);
  };

  const initialize = async (settings: VideoRecordingSettings): Promise<CameraSourceSession> => {
    const initializationGeneration = generation;
    const target = await initializeCameraSourceSession({
      deps,
      isCurrent: () => generation === initializationGeneration,
      settings,
    });
    session = target;
    return target;
  };

  const ensureSession = async (settings: VideoRecordingSettings): Promise<CameraSourceSession> => {
    if (session) return session;
    if (!pendingInitialization) {
      const pending = initialize(settings).finally(() => {
        if (pendingInitialization === pending) pendingInitialization = null;
      });
      pendingInitialization = pending;
    }
    return pendingInitialization;
  };

  return {
    async acquire(settings: VideoRecordingSettings): Promise<CameraSourceLease> {
      const target = await ensureSession(settings);
      if (session !== target) throw new Error('Camera source is no longer active.');
      if (!target.output) throw new Error('Normalized camera source is not available.');
      const outputTrack = requireVideoTrack(
        target.output,
        'Normalized camera source is missing a video track.'
      );
      const leasedTrack = outputTrack.clone();
      const stream = new MediaStream([leasedTrack]);
      target.leases += 1;
      target.leasedTracks.add(leasedTrack);
      let released = false;
      return {
        release: () => {
          if (released) return;
          released = true;
          stopStream(stream);
          target.leasedTracks.delete(leasedTrack);
          target.leases = Math.max(0, target.leases - 1);
          if (target.leases === 0) closeSession(target);
        },
        stream,
        trackSettings: {
          ...target.dimensions,
          frameRate: target.frameRate,
        },
      };
    },

    async switchInput(deviceId: string | null): Promise<void> {
      const target = session;
      if (!target) throw new Error('Camera source is not active.');
      const switchGeneration = (generation += 1);
      const candidate = await deps.acquireRawStream({
        audio: false,
        video: buildReplacementVideoConstraints(deviceId),
      });
      let candidateVideo: HTMLVideoElement | null = null;
      try {
        requireVideoTrack(candidate, 'Replacement camera stream is missing a video track.');
        candidateVideo = deps.createVideo(candidate);
        await deps.waitForMetadata(candidateVideo);
        if (generation !== switchGeneration || session !== target) {
          throw new Error('Camera source switch was superseded.');
        }
        const previousRaw = target.raw;
        const previousVideo = target.video;
        target.raw = candidate;
        target.video = candidateVideo;
        stopStream(previousRaw);
        releaseVideo(previousVideo);
      } catch (error) {
        if (candidateVideo) releaseVideo(candidateVideo);
        stopStream(candidate);
        throw error;
      }
    },

    setEnabled(enabled: boolean): void {
      session?.raw.getVideoTracks().forEach((track) => {
        track.enabled = enabled;
      });
      session?.leasedTracks.forEach((track) => {
        track.enabled = enabled;
      });
    },

    close(): void {
      generation += 1;
      if (session) closeSession(session);
    },

    hasActiveSource(): boolean {
      return session !== null;
    },
  };
}

const cameraSourceOwner = createCameraSourceOwner({
  acquireRawStream: (constraints) => navigator.mediaDevices.getUserMedia(constraints),
  createVideo: createSourceVideo,
  waitForMetadata: waitForSourceMetadata,
});

export const acquireCameraSource = cameraSourceOwner.acquire;
export const setCameraSourceEnabled = cameraSourceOwner.setEnabled;
export const switchCameraSourceInput = cameraSourceOwner.switchInput;
