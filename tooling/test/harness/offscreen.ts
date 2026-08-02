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
  stageProjectExportInput,
};

setReadyState(false);

void harnessReady.then(async () => {
  resetOffscreenHarnessState();
  await import('../../../apps/extension/src/offscreen/offscreen');
  setReadyState(true);
});
