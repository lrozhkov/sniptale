import { harnessReady } from './browser-mocks';
import { recordingContext } from '../../../apps/extension/src/offscreen/recording/context';
import { stageProjectExportInput } from '../../../apps/extension/src/composition/persistence/project-export-inputs';
import type { ProjectExportInputReference } from '../../../apps/extension/src/contracts/video/types/messages.export';
import type { VideoProject } from '../../../apps/extension/src/features/video/project/types';
import { createCanvasVideoOutput } from '../../../apps/extension/src/offscreen/recording/stream/canvas-video-output';

type HarnessMediaRecorderState = 'inactive' | 'recording' | 'paused';

type StaticCanvasRecordingResult = {
  decodedDurationMs: number;
  drawCount: number;
  height: number;
  mimeType: string;
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
    'video/mp4;codecs=avc1.42E01E',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
  ];
  const mimeType = candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate));
  if (!mimeType) {
    throw new Error('The browser exposes no supported recording format for the canvas smoke');
  }
  return mimeType;
}

async function readBlobVideoDurationMs(blob: Blob): Promise<number> {
  const video = document.createElement('video');
  const url = URL.createObjectURL(blob);
  try {
    video.preload = 'metadata';
    video.src = url;
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('The static canvas artifact is not decodable'));
    });
    if (Number.isFinite(video.duration)) {
      return video.duration * 1000;
    }
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
    return video.currentTime * 1000;
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
  return {
    decodedDurationMs: await readBlobVideoDurationMs(blob),
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
  recordingContext.bindStartingRecorder(harnessMediaRecorder as unknown as MediaRecorder);
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
  recordStaticCanvasArtifact,
  stageProjectExportInput,
};

setReadyState(false);

void harnessReady.then(async () => {
  resetOffscreenHarnessState();
  await import('../../../apps/extension/src/offscreen/offscreen');
  setReadyState(true);
});
