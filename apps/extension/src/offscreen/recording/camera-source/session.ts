import type { VideoRecordingSettings } from '@sniptale/runtime-contracts/video/types/types';
import {
  buildWebcamQualityConstraints,
  resolveWebcamFrameRatePresetValue,
  resolveWebcamQualitySettings,
} from '@sniptale/runtime-contracts/video/types/webcam-quality';
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
  profileKey: string;
  raw: MediaStream;
  requestedDeviceId: string | null;
  qualityConstraints: MediaTrackConstraints;
  video: HTMLVideoElement;
};

type CameraSourceDependencies = {
  acquireRawStream: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  createVideo: (stream: MediaStream) => HTMLVideoElement;
  waitForMetadata: (video: HTMLVideoElement) => Promise<void>;
};

const EMBEDDED_CAMERA_PREVIEW_MAX_EDGE = 640;
const EMBEDDED_CAMERA_PREVIEW_MAX_FRAME_RATE = 30;

function resolveCameraSourceProfileKey(settings: VideoRecordingSettings): string {
  if (settings.webcamPresentation?.mode === 'embedded') return 'embedded-preview';
  const quality = resolveWebcamQualitySettings(settings);
  return `separate-track:${quality.resolution}:${quality.frameRate}`;
}

function resolveCameraOutputDimensions(
  settings: VideoRecordingSettings,
  source: { height: number; width: number }
): { height: number; width: number } {
  if (settings.webcamPresentation?.mode !== 'embedded') return source;
  const scale = Math.min(
    1,
    EMBEDDED_CAMERA_PREVIEW_MAX_EDGE / source.width,
    EMBEDDED_CAMERA_PREVIEW_MAX_EDGE / source.height
  );
  return {
    height: Math.max(2, Math.round((source.height * scale) / 2) * 2),
    width: Math.max(2, Math.round((source.width * scale) / 2) * 2),
  };
}

function buildCameraInputQualityConstraints(
  settings: VideoRecordingSettings
): MediaTrackConstraints {
  const requested = buildWebcamQualityConstraints(resolveWebcamQualitySettings(settings));
  if (settings.webcamPresentation?.mode !== 'embedded') return requested;
  return {
    ...requested,
    frameRate: {
      ideal: EMBEDDED_CAMERA_PREVIEW_MAX_FRAME_RATE,
      max: EMBEDDED_CAMERA_PREVIEW_MAX_FRAME_RATE,
    },
    height: { max: EMBEDDED_CAMERA_PREVIEW_MAX_EDGE },
    width: { ideal: EMBEDDED_CAMERA_PREVIEW_MAX_EDGE, max: EMBEDDED_CAMERA_PREVIEW_MAX_EDGE },
  };
}

function buildVideoConstraints(settings: VideoRecordingSettings): MediaTrackConstraints {
  return {
    ...(settings.webcamDeviceId ? { deviceId: { exact: settings.webcamDeviceId } } : {}),
    ...buildCameraInputQualityConstraints(settings),
  };
}

function buildReplacementVideoConstraints(
  deviceId: string | null,
  qualityConstraints: MediaTrackConstraints
): MediaTrackConstraints {
  return {
    ...qualityConstraints,
    ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
  };
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
  // Embedded camera is composed by the tab itself. Keep the stable preview track
  // at the camera's negotiated size instead of upscaling every frame to the main
  // recording output resolution in the offscreen document.
  target.dimensions = resolveCameraOutputDimensions(settings, {
    height: target.video.videoHeight,
    width: target.video.videoWidth,
  });
  return createCanvasVideoOutput({
    contentHint: 'motion',
    dimensions: target.dimensions,
    frameRate: target.frameRate,
    initializeDrawing: ({ canvas, context }) => ({
      drawLiveFrame: () => {
        const video = target.video;
        if (video.videoWidth <= 0 || video.videoHeight <= 0) return false;
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = '#000000';
        context.fillRect(0, 0, canvas.width, canvas.height);
        const sourceAspect = video.videoWidth / video.videoHeight;
        const outputAspect = canvas.width / canvas.height;
        const sourceWidth =
          sourceAspect > outputAspect ? video.videoHeight * outputAspect : video.videoWidth;
        const sourceHeight =
          sourceAspect > outputAspect ? video.videoHeight : video.videoWidth / outputAspect;
        const sourceX = (video.videoWidth - sourceWidth) / 2;
        const sourceY = (video.videoHeight - sourceHeight) / 2;
        context.drawImage(
          video,
          sourceX,
          sourceY,
          sourceWidth,
          sourceHeight,
          0,
          0,
          canvas.width,
          canvas.height
        );
        return true;
      },
    }),
    release: () => undefined,
    sourceVideo: target.video,
  });
}

async function initializeCameraSourceSession(args: {
  deps: CameraSourceDependencies;
  isCurrent: () => boolean;
  settings: VideoRecordingSettings;
}): Promise<CameraSourceSession> {
  const qualityConstraints = buildCameraInputQualityConstraints(args.settings);
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
    const requestedFrameRate = Math.min(
      selectedFrameRate ?? args.settings.outputProfile.frameRate,
      args.settings.outputProfile.frameRate
    );
    const frameRate = resolveFixedVideoFrameRate(
      args.settings.webcamPresentation?.mode === 'embedded'
        ? Math.min(requestedFrameRate, EMBEDDED_CAMERA_PREVIEW_MAX_FRAME_RATE)
        : requestedFrameRate,
      sourceTrack.getSettings().frameRate
    );
    const target: CameraSourceSession = {
      closed: false,
      dimensions: { height: 0, width: 0 },
      frameRate,
      leasedTracks: new Set(),
      leases: 0,
      output: null,
      profileKey: resolveCameraSourceProfileKey(args.settings),
      qualityConstraints,
      raw,
      requestedDeviceId: args.settings.webcamDeviceId ?? null,
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

async function acquireCameraSourceLease(args: {
  closeSession: (target: CameraSourceSession) => void;
  ensureRequestedInput: (target: CameraSourceSession, deviceId: string | null) => Promise<void>;
  isCurrent: (target: CameraSourceSession) => boolean;
  settings: VideoRecordingSettings;
  target: CameraSourceSession;
}): Promise<CameraSourceLease> {
  const { target } = args;
  target.leases += 1;
  let leasedTrack: MediaStreamTrack | null = null;
  let stream: MediaStream | null = null;
  try {
    await args.ensureRequestedInput(target, args.settings.webcamDeviceId ?? null);
    if (!args.isCurrent(target)) throw new Error('Camera source is no longer active.');
    if (!target.output) throw new Error('Normalized camera source is not available.');
    const outputTrack = requireVideoTrack(
      target.output,
      'Normalized camera source is missing a video track.'
    );
    leasedTrack = outputTrack.clone();
    stream = new MediaStream([leasedTrack]);
    target.leasedTracks.add(leasedTrack);
  } catch (error) {
    target.leases = Math.max(0, target.leases - 1);
    if (target.leases === 0) args.closeSession(target);
    throw error;
  }
  let released = false;
  return {
    release: () => {
      if (released) return;
      released = true;
      stopStream(stream!);
      target.leasedTracks.delete(leasedTrack!);
      target.leases = Math.max(0, target.leases - 1);
      if (target.leases === 0) args.closeSession(target);
    },
    stream,
    trackSettings: {
      ...target.dimensions,
      frameRate: target.frameRate,
    },
  };
}

function createCameraInputSwitcher(args: {
  deps: CameraSourceDependencies;
  getGeneration: () => number;
  getSession: () => CameraSourceSession | null;
  nextGeneration: () => number;
}) {
  let pendingInputSwitch: Promise<void> | null = null;
  let pendingInputSwitchDeviceId: string | null = null;

  const replaceInput = async (
    target: CameraSourceSession,
    deviceId: string | null
  ): Promise<void> => {
    const switchGeneration = args.nextGeneration();
    const candidate = await args.deps.acquireRawStream({
      audio: false,
      video: buildReplacementVideoConstraints(deviceId, target.qualityConstraints),
    });
    let candidateVideo: HTMLVideoElement | null = null;
    try {
      requireVideoTrack(candidate, 'Replacement camera stream is missing a video track.');
      candidateVideo = args.deps.createVideo(candidate);
      await args.deps.waitForMetadata(candidateVideo);
      if (args.getGeneration() !== switchGeneration || args.getSession() !== target) {
        throw new Error('Camera source switch was superseded.');
      }
      const previousRaw = target.raw;
      const previousVideo = target.video;
      target.raw = candidate;
      target.requestedDeviceId = deviceId;
      target.video = candidateVideo;
      stopStream(previousRaw);
      releaseVideo(previousVideo);
    } catch (error) {
      if (candidateVideo) releaseVideo(candidateVideo);
      stopStream(candidate);
      throw error;
    }
  };

  return async (target: CameraSourceSession, deviceId: string | null): Promise<void> => {
    if (target.requestedDeviceId === deviceId) return;
    if (pendingInputSwitch && pendingInputSwitchDeviceId === deviceId) {
      await pendingInputSwitch;
      return;
    }
    pendingInputSwitchDeviceId = deviceId;
    const pending = replaceInput(target, deviceId).finally(() => {
      if (pendingInputSwitch === pending) {
        pendingInputSwitch = null;
        pendingInputSwitchDeviceId = null;
      }
    });
    pendingInputSwitch = pending;
    await pending;
  };
}

export function createCameraSourceOwner(deps: CameraSourceDependencies) {
  let session: CameraSourceSession | null = null;
  let pendingInitialization: Promise<CameraSourceSession> | null = null;
  let pendingInitializationProfileKey: string | null = null;
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
    const profileKey = resolveCameraSourceProfileKey(settings);
    if (session?.profileKey === profileKey) return session;
    if (session) {
      if (session.leases > 0) {
        throw new Error(
          'Camera source profile cannot change while incompatible leases are active.'
        );
      }
      closeSession(session);
    }
    if (pendingInitialization && pendingInitializationProfileKey !== profileKey) {
      generation += 1;
      await pendingInitialization.catch(() => undefined);
      return ensureSession(settings);
    }
    if (!pendingInitialization) {
      const pending = initialize(settings).finally(() => {
        if (pendingInitialization === pending) {
          pendingInitialization = null;
          pendingInitializationProfileKey = null;
        }
      });
      pendingInitialization = pending;
      pendingInitializationProfileKey = profileKey;
    }
    return pendingInitialization;
  };

  const ensureRequestedInput = createCameraInputSwitcher({
    deps,
    getGeneration: () => generation,
    getSession: () => session,
    nextGeneration: () => (generation += 1),
  });

  return {
    async acquire(settings: VideoRecordingSettings): Promise<CameraSourceLease> {
      const target = await ensureSession(settings);
      return acquireCameraSourceLease({
        closeSession,
        ensureRequestedInput,
        isCurrent: (candidate) => session === candidate,
        settings,
        target,
      });
    },

    async switchInput(deviceId: string | null): Promise<void> {
      const target = session ?? (pendingInitialization ? await pendingInitialization : null);
      if (!target) throw new Error('Camera source is not active.');
      await ensureRequestedInput(target, deviceId);
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
