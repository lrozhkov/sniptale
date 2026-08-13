import { harnessReady } from './browser-mocks';
import { recordingContext } from '../../../apps/extension/src/offscreen/recording/context';
import { stageProjectExportInput } from '../../../apps/extension/src/composition/persistence/project-export-inputs';
import type { ProjectExportInputReference } from '../../../apps/extension/src/contracts/video/types/messages.export';
import type { VideoProject } from '../../../apps/extension/src/features/video/project/types';
import { createCanvasVideoOutput } from '../../../apps/extension/src/offscreen/recording/stream/canvas-video-output';
import { createRecordingArtifactSession } from '../../../apps/extension/src/offscreen/recording/encoding/artifact-session';
import {
  createOpfsRecordingStagingStorage,
  createRecordingStagingCoordinator,
  type RecordingStagingStorageAdapter,
} from '../../../apps/extension/src/composition/persistence/recordings/staging';
import { createGatedCropStream } from '../../../apps/extension/src/offscreen/recording/stream/crop-stream';
import type {
  CropStreamControls,
  VerifiedViewportFrame,
} from '../../../apps/extension/src/offscreen/recording/stream/crop-frame-gate';

type HarnessMediaRecorderState = 'inactive' | 'recording' | 'paused';

type StaticCanvasRecordingResult = {
  centerPixel: { alpha: number; blue: number; green: number; red: number };
  decodedDurationMs: number;
  drawCount: number;
  height: number;
  mimeType: string;
  size: number;
  width: number;
};

type ColdHighResolutionRecordingResult = {
  appendCount: number;
  firstAppendMs: number;
  height: number;
  mimeType: string;
  preStopAppendCount: number;
  recordingDurationMs: number;
  size: number;
  width: number;
};

type ViewportFrameVerificationResult = {
  cleanPendingWhileMarked: boolean;
  cleanPendingWithPartialMarker: boolean;
  earlyThawRejected: boolean;
  firstLiveCorner: { blue: number; green: number; red: number };
  lateGeometryRejected: boolean;
  observedRect: { height: number; width: number; x: number; y: number };
  pendingCorner: { blue: number; green: number; red: number };
  sourceSize: { height: number; width: number };
  staleThawResult: 'stale';
};

type OffscreenHarnessBridge = {
  reset: () => Promise<void>;
  stageProjectExportInput: (
    jobId: string,
    project: VideoProject
  ) => Promise<ProjectExportInputReference>;
  setMediaRecorderState: (state: HarnessMediaRecorderState) => void;
  getMediaRecorderState: () => HarnessMediaRecorderState;
  recordColdHighResolutionSequence: () => Promise<ColdHighResolutionRecordingResult[]>;
  recordStaticCanvasArtifact: () => Promise<StaticCanvasRecordingResult>;
  verifyFrameGatedViewportCrop: () => Promise<ViewportFrameVerificationResult>;
};

declare global {
  interface Window {
    __sniptaleOffscreenHarness?: OffscreenHarnessBridge;
  }
}

class HarnessMediaRecorder {
  state: HarnessMediaRecorderState;

  constructor(state: HarnessMediaRecorderState) {
    this.state = state;
  }

  pause() {
    this.state = 'paused';
  }

  resume() {
    this.state = 'recording';
  }

  stop() {
    this.state = 'inactive';
  }
}

let harnessMediaRecorder: HarnessMediaRecorder | null = null;

function resolveStaticCanvasRecordingMimeType(): string {
  const candidates = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/mp4;codecs=avc1.42E01E',
  ];
  const mimeType = candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate));
  if (!mimeType) {
    throw new Error('The browser exposes no supported recording format for the canvas smoke');
  }
  return mimeType;
}

function createObservedOpfsStorage(
  onAppend: (chunk: Blob) => void
): RecordingStagingStorageAdapter {
  const storage = createOpfsRecordingStagingStorage();
  return {
    countSessions: () => storage.countSessions(),
    removeAllSessions: () => storage.removeAllSessions(),
    async createSession() {
      const session = await storage.createSession();
      return {
        remove: () => session.remove(),
        async createArtifact() {
          const artifact = await session.createArtifact();
          return {
            abort: () => artifact.abort(),
            async append(chunk) {
              onAppend(chunk);
              await artifact.append(chunk);
            },
            close: () => artifact.close(),
            getFile: () => artifact.getFile(),
            remove: () => artifact.remove(),
          };
        },
      };
    },
  };
}

async function recordColdHighResolutionArtifact(
  runIndex: number
): Promise<ColdHighResolutionRecordingResult> {
  const width = 2560;
  const height = 1440;
  const frameRate = 30;
  const recordingDurationMs = 4_000;
  const mimeType = resolveStaticCanvasRecordingMimeType();
  const appendTimes: number[] = [];
  let startedAt = 0;
  let stopRequestedAt = Number.POSITIVE_INFINITY;
  const coordinator = await createRecordingStagingCoordinator({
    storage: createObservedOpfsStorage(() => {
      appendTimes.push(performance.now() - startedAt);
    }),
  });
  const source = document.createElement('canvas');
  source.width = width;
  source.height = height;
  const sourceContext = source.getContext('2d', { alpha: false });
  if (!sourceContext) throw new Error('The browser exposes no 2D canvas for the cold recording');
  let frameIndex = 0;
  const stream = createCanvasVideoOutput({
    dimensions: { height, width },
    frameRate,
    initializeDrawing: ({ context }) => ({
      drawLiveFrame: () => {
        sourceContext.fillStyle = '#15243a';
        sourceContext.fillRect(0, 0, width, height);
        sourceContext.fillStyle = '#f04b32';
        sourceContext.fillRect((frameIndex * 31) % (width - 240), 480, 240, 240);
        context.drawImage(source, 0, 0);
        frameIndex += 1;
        return true;
      },
    }),
    release: () => undefined,
  });
  const track = stream.getVideoTracks()[0];
  if (!track) throw new Error('The cold recording smoke produced no video track');
  const session = await createRecordingArtifactSession({
    artifactId: `cold-high-resolution-${runIndex}`,
    coordinator,
    filename: `cold-high-resolution-${runIndex}.${mimeType.startsWith('video/mp4') ? 'mp4' : 'webm'}`,
    mimeType,
    recorderOptions: { mimeType, videoBitsPerSecond: 24_000_000 },
    stream,
  });
  let finalized = false;
  try {
    const started = new Promise<void>((resolve, reject) => {
      session.setLifecycleCallbacks({
        onFailure: reject,
        onStart: resolve,
      });
    });
    startedAt = performance.now();
    session.start();
    await started;
    await new Promise<void>((resolve) => setTimeout(resolve, recordingDurationMs));
    stopRequestedAt = performance.now() - startedAt;
    const artifact = await session.stop();
    const result = {
      appendCount: appendTimes.length,
      firstAppendMs: appendTimes[0] ?? Number.POSITIVE_INFINITY,
      height,
      mimeType: artifact.mimeType,
      preStopAppendCount: appendTimes.filter((time) => time < stopRequestedAt).length,
      recordingDurationMs,
      size: artifact.size,
      width,
    };
    await coordinator.delete();
    finalized = true;
    return result;
  } finally {
    track.stop();
    if (!finalized) await coordinator.abort().catch(() => undefined);
  }
}

async function recordColdHighResolutionSequence(): Promise<ColdHighResolutionRecordingResult[]> {
  return [await recordColdHighResolutionArtifact(1), await recordColdHighResolutionArtifact(2)];
}

async function readBlobVideoMetrics(blob: Blob): Promise<{
  centerPixel: StaticCanvasRecordingResult['centerPixel'];
  decodedDurationMs: number;
}> {
  const video = document.createElement('video');
  const url = URL.createObjectURL(blob);
  try {
    video.muted = true;
    video.preload = 'metadata';
    video.src = url;
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('The static canvas artifact is not decodable'));
    });
    let durationSeconds = video.duration;
    if (!Number.isFinite(durationSeconds)) {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error('Timed out resolving static canvas artifact duration')),
          5_000
        );
        video.ontimeupdate = () => {
          clearTimeout(timeout);
          resolve();
        };
        video.currentTime = Number.MAX_SAFE_INTEGER;
      });
      durationSeconds = video.currentTime;
    }
    const sampleTime = Math.min(0.5, Math.max(0, durationSeconds / 2));
    if (sampleTime > 0) {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error('Timed out seeking the static canvas artifact')),
          5_000
        );
        video.onseeked = () => {
          clearTimeout(timeout);
          resolve();
        };
        video.currentTime = sampleTime;
      });
    }
    const sampleCanvas = document.createElement('canvas');
    sampleCanvas.width = 1;
    sampleCanvas.height = 1;
    const sampleContext = sampleCanvas.getContext('2d', { alpha: false });
    if (!sampleContext) throw new Error('The browser exposes no canvas for artifact sampling');
    sampleContext.drawImage(video, 0, 0, 1, 1);
    const [red = 0, green = 0, blue = 0, alpha = 0] = sampleContext.getImageData(0, 0, 1, 1).data;
    return {
      centerPixel: { alpha, blue, green, red },
      decodedDurationMs: durationSeconds * 1000,
    };
  } finally {
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(url);
  }
}

async function recordStaticCanvasArtifact(): Promise<StaticCanvasRecordingResult> {
  const width = 854;
  const height = 480;
  const frameRate = 30;
  const recordingDurationMs = 1_200;
  const source = document.createElement('canvas');
  source.width = width;
  source.height = height;
  const sourceContext = source.getContext('2d', { alpha: false });
  if (!sourceContext) {
    throw new Error('The browser exposes no 2D canvas for the recording smoke');
  }
  sourceContext.fillStyle = '#2463eb';
  sourceContext.fillRect(0, 0, width, height);
  const mimeType = resolveStaticCanvasRecordingMimeType();
  const chunks: Blob[] = [];
  let drawCount = 0;
  const stream = createCanvasVideoOutput({
    dimensions: { height, width },
    frameRate,
    initializeDrawing: ({ context }) => ({
      drawLiveFrame: () => {
        context.drawImage(source, 0, 0);
        drawCount += 1;
        return true;
      },
    }),
    release: () => undefined,
  });
  const track = stream.getVideoTracks()[0];
  if (!track) throw new Error('The canvas recording smoke produced no video track');
  const recorder = new MediaRecorder(stream, { mimeType });
  try {
    await new Promise<void>((resolve, reject) => {
      let stopTimer: ReturnType<typeof setTimeout> | null = null;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      recorder.onerror = () => reject(new Error('Static canvas MediaRecorder failed'));
      recorder.onstart = () => {
        stopTimer = setTimeout(() => recorder.stop(), recordingDurationMs);
      };
      recorder.onstop = () => {
        if (stopTimer !== null) clearTimeout(stopTimer);
        resolve();
      };
      recorder.start(250);
    });
  } finally {
    track.stop();
  }
  const blob = new Blob(chunks, { type: recorder.mimeType || mimeType });
  const metrics = await readBlobVideoMetrics(blob);
  return {
    ...metrics,
    drawCount,
    height,
    mimeType: blob.type,
    size: blob.size,
    width,
  };
}

async function waitForVideoFrames(video: HTMLVideoElement, count: number): Promise<void> {
  await new Promise<void>((resolve) => {
    const wait = (remaining: number) => {
      video.requestVideoFrameCallback(() => {
        if (remaining <= 1) resolve();
        else wait(remaining - 1);
      });
    };
    wait(count);
  });
}

function sampleVideoCorner(video: HTMLVideoElement, width: number, height: number) {
  const sample = document.createElement('canvas');
  sample.width = width;
  sample.height = height;
  const context = sample.getContext('2d', { alpha: false });
  if (!context) throw new Error('Viewport verification sample canvas is unavailable');
  context.drawImage(video, 0, 0);
  const [red = 0, green = 0, blue = 0] = context.getImageData(2, 2, 1, 1).data;
  return { blue, green, red };
}

const VIEWPORT_VERIFICATION_RECT = { x: 80, y: 45, width: 480, height: 270 } as const;
const VIEWPORT_VERIFICATION_PATTERN = {
  edgeThicknessCss: 8,
  colors: {
    top: { red: 236, green: 32, blue: 58 },
    right: { red: 38, green: 220, blue: 75 },
    bottom: { red: 42, green: 72, blue: 232 },
    left: { red: 226, green: 42, blue: 214 },
  },
} as const;

type ViewportVerificationSource = {
  removeMarker: () => void;
  showMarker: () => void;
  showPartialMarker: () => void;
  stop: () => void;
  stream: MediaStream;
};

function createViewportVerificationSource(): ViewportVerificationSource {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 360;
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('Viewport verification source canvas is unavailable');
  let markerMode: 'full' | 'none' | 'partial' = 'none';
  let viewportFill = '#2463eb';
  const draw = () => {
    context.fillStyle = '#f59e0b';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = viewportFill;
    context.fillRect(
      VIEWPORT_VERIFICATION_RECT.x,
      VIEWPORT_VERIFICATION_RECT.y,
      VIEWPORT_VERIFICATION_RECT.width,
      VIEWPORT_VERIFICATION_RECT.height
    );
    if (markerMode === 'none') return;
    const { edgeThicknessCss: thickness, colors } = VIEWPORT_VERIFICATION_PATTERN;
    const color = (value: { red: number; green: number; blue: number }) =>
      `rgb(${value.red}, ${value.green}, ${value.blue})`;
    context.fillStyle = color(colors.top);
    context.fillRect(
      VIEWPORT_VERIFICATION_RECT.x,
      VIEWPORT_VERIFICATION_RECT.y,
      VIEWPORT_VERIFICATION_RECT.width,
      thickness
    );
    context.fillStyle = color(colors.bottom);
    context.fillRect(
      VIEWPORT_VERIFICATION_RECT.x,
      VIEWPORT_VERIFICATION_RECT.y + VIEWPORT_VERIFICATION_RECT.height - thickness,
      VIEWPORT_VERIFICATION_RECT.width,
      thickness
    );
    context.fillStyle = color(colors.left);
    context.fillRect(
      VIEWPORT_VERIFICATION_RECT.x,
      VIEWPORT_VERIFICATION_RECT.y + thickness,
      thickness,
      VIEWPORT_VERIFICATION_RECT.height - thickness * 2
    );
    if (markerMode === 'full') {
      context.fillStyle = color(colors.right);
      context.fillRect(
        VIEWPORT_VERIFICATION_RECT.x + VIEWPORT_VERIFICATION_RECT.width - thickness,
        VIEWPORT_VERIFICATION_RECT.y + thickness,
        thickness,
        VIEWPORT_VERIFICATION_RECT.height - thickness * 2
      );
    }
  };
  draw();
  const timer = setInterval(draw, 16);
  const stream = canvas.captureStream(30);
  return {
    removeMarker: () => {
      markerMode = 'none';
      viewportFill = '#a3e635';
      draw();
    },
    showMarker: () => {
      markerMode = 'full';
      draw();
    },
    showPartialMarker: () => {
      markerMode = 'partial';
      draw();
    },
    stop: () => clearInterval(timer),
    stream,
  };
}

function requireVerifiedFrame(
  result: { frame?: VerifiedViewportFrame; result: 'applied' | 'stale' },
  label: string
): VerifiedViewportFrame {
  if (result.result !== 'applied' || !result.frame) {
    throw new Error(`Chromium ${label} viewport frame was not verified`);
  }
  return result.frame;
}

function requireRejectedOperation(operation: () => unknown, expectedMessage: string): true {
  try {
    operation();
  } catch (error) {
    if (error instanceof Error && error.message.includes(expectedMessage)) return true;
    throw error;
  }
  throw new Error(`Chromium viewport verification accepted ${expectedMessage}`);
}

async function verifyMarkerCleanup(params: {
  controls: CropStreamControls;
  outputVideo: HTMLVideoElement;
  removeMarker: () => void;
  showPartialMarker: () => void;
  transitionId: string;
}): Promise<{
  cleanPendingWhileMarked: true;
  cleanPendingWithPartialMarker: true;
  frame: VerifiedViewportFrame;
}> {
  let cleanSettled = false;
  const verification = params.controls
    .verifyFrozenSourceFrame(params.transitionId, {
      pattern: VIEWPORT_VERIFICATION_PATTERN,
      phase: 'clean',
    })
    .finally(() => {
      cleanSettled = true;
    });
  await withHarnessDeadline(
    waitForVideoFrames(params.outputVideo, 3),
    'marker-held clean rejection'
  );
  if (cleanSettled) {
    throw new Error('Chromium clean verification accepted a frame with the marker present');
  }
  params.showPartialMarker();
  await withHarnessDeadline(
    waitForVideoFrames(params.outputVideo, 3),
    'partial-marker clean rejection'
  );
  if (cleanSettled) {
    throw new Error('Chromium clean verification accepted a partial marker frame');
  }
  params.removeMarker();
  const result = await withHarnessDeadline(verification, 'clean viewport frame verification');
  return {
    cleanPendingWhileMarked: true,
    cleanPendingWithPartialMarker: true,
    frame: requireVerifiedFrame(result, 'clean'),
  };
}

function rejectLateViewportGeometry(controls: CropStreamControls, transitionId: string): true {
  return requireRejectedOperation(
    () =>
      controls.applyFrozenSourceGeometry(transitionId, {
        fit: 'contain',
        outputSize: {
          width: VIEWPORT_VERIFICATION_RECT.width,
          height: VIEWPORT_VERIFICATION_RECT.height,
        },
        sourceRect: { x: 0, y: 0, width: 640, height: 360 },
      }),
    'cannot change'
  );
}

async function withHarnessDeadline<T>(work: Promise<T>, label: string): Promise<T> {
  let timeoutId!: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`Timed out during ${label}`)), 10_000);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timeoutId));
}

async function verifyFrameGatedViewportCrop(): Promise<ViewportFrameVerificationResult> {
  const source = createViewportVerificationSource();
  const gated = await withHarnessDeadline(
    createGatedCropStream(
      source.stream,
      {
        fit: 'contain',
        outputSize: {
          width: VIEWPORT_VERIFICATION_RECT.width,
          height: VIEWPORT_VERIFICATION_RECT.height,
        },
        sourceRect: VIEWPORT_VERIFICATION_RECT,
      },
      { requiresFrameVerification: true }
    ),
    'source metadata and gated output creation'
  );
  const outputVideo = document.createElement('video');
  outputVideo.muted = true;
  outputVideo.srcObject = gated.stream;
  try {
    await withHarnessDeadline(outputVideo.play(), 'gated output playback');
    await withHarnessDeadline(waitForVideoFrames(outputVideo, 2), 'initial safe viewport frames');
    const transitionId = 'chromium-frame-verification';
    if (gated.controls.setFrozen(transitionId, true) !== 'applied') {
      throw new Error('Chromium viewport verification could not freeze output');
    }
    source.showMarker();
    const markedFrame = requireVerifiedFrame(
      await withHarnessDeadline(
        gated.controls.verifyFrozenSourceFrame(transitionId, {
          pattern: VIEWPORT_VERIFICATION_PATTERN,
          phase: 'marked',
        }),
        'marked viewport frame verification'
      ),
      'marked'
    );
    if (
      gated.controls.applyFrozenSourceGeometry(transitionId, {
        fit: 'contain',
        outputSize: {
          width: VIEWPORT_VERIFICATION_RECT.width,
          height: VIEWPORT_VERIFICATION_RECT.height,
        },
        sourceRect: markedFrame.viewportRect,
      }) !== 'applied'
    ) {
      throw new Error('Chromium observed viewport crop was not applied');
    }
    const staleThawResult = gated.controls.setFrozen('chromium-stale-transition', false);
    if (staleThawResult !== 'stale') {
      throw new Error('Chromium viewport verification accepted a stale thaw');
    }
    const earlyThawRejected = requireRejectedOperation(
      () => gated.controls.setFrozen(transitionId, false),
      'clean source frame'
    );
    await withHarnessDeadline(waitForVideoFrames(outputVideo, 2), 'pending held output frames');
    const pendingCorner = sampleVideoCorner(
      outputVideo,
      VIEWPORT_VERIFICATION_RECT.width,
      VIEWPORT_VERIFICATION_RECT.height
    );
    const cleanup = await verifyMarkerCleanup({
      controls: gated.controls,
      outputVideo,
      removeMarker: source.removeMarker,
      showPartialMarker: source.showPartialMarker,
      transitionId,
    });
    const lateGeometryRejected = rejectLateViewportGeometry(gated.controls, transitionId);

    const firstLiveFrame = waitForVideoFrames(outputVideo, 1);
    if (gated.controls.setFrozen(transitionId, false) !== 'applied') {
      throw new Error('Chromium verified viewport output could not resume');
    }
    await withHarnessDeadline(firstLiveFrame, 'first live cropped output frame');
    const firstLiveCorner = sampleVideoCorner(
      outputVideo,
      VIEWPORT_VERIFICATION_RECT.width,
      VIEWPORT_VERIFICATION_RECT.height
    );
    return {
      cleanPendingWhileMarked: cleanup.cleanPendingWhileMarked,
      cleanPendingWithPartialMarker: cleanup.cleanPendingWithPartialMarker,
      earlyThawRejected,
      firstLiveCorner,
      lateGeometryRejected,
      observedRect: markedFrame.viewportRect,
      pendingCorner,
      sourceSize: markedFrame.sourceSize,
      staleThawResult,
    };
  } finally {
    source.stop();
    outputVideo.pause();
    outputVideo.srcObject = null;
    gated.stream.getTracks().forEach((track) => track.stop());
    source.stream.getTracks().forEach((track) => track.stop());
  }
}

function getRoot() {
  return document.getElementById('root');
}

function setReadyState(ready: boolean) {
  const root = getRoot();
  if (!root) {
    return;
  }

  root.dataset['ui'] = 'offscreen.harness.root';
  root.dataset['state'] = ready ? 'ready' : 'loading';
  root.textContent = ready ? 'Offscreen harness ready' : 'Loading offscreen harness';
}

function resetOffscreenHarnessState() {
  harnessMediaRecorder = null;
  recordingContext.resetRecordingSession();
  recordingContext.durationTracker.reset();
  recordingContext.viewportDrawFrozen = false;
  recordingContext.viewportNavigationEpoch = 0;
  recordingContext.updateViewportPresetCrop = null;
  recordingContext.updateViewportPresetDrawState = null;
}

function setMediaRecorderState(state: HarnessMediaRecorderState) {
  harnessMediaRecorder = new HarnessMediaRecorder(state);
  recordingContext.resetRecordingSession();
  if (state === 'inactive') {
    return;
  }

  recordingContext.beginRecordingSession('recording-e2e-harness', 1);
  recordingContext.bindStreamInstance({
    generation: 1,
    recordingId: 'recording-e2e-harness',
    streamInstanceId: 'stream-instance-e2e-harness',
  });
  recordingContext.mediaRecorder = harnessMediaRecorder as unknown as MediaRecorder;
  recordingContext.activateRecorder(harnessMediaRecorder as unknown as MediaRecorder);
}

window.__sniptaleOffscreenHarness = {
  async reset() {
    await window.__sniptaleHarness?.reset();
    resetOffscreenHarnessState();
  },
  setMediaRecorderState,
  getMediaRecorderState() {
    return harnessMediaRecorder?.state ?? 'inactive';
  },
  recordColdHighResolutionSequence,
  recordStaticCanvasArtifact,
  verifyFrameGatedViewportCrop,
  stageProjectExportInput,
};

setReadyState(false);

void harnessReady.then(async () => {
  resetOffscreenHarnessState();
  await import('../../../apps/extension/src/offscreen/offscreen');
  setReadyState(true);
});
