import { harnessReady } from './browser-mocks/browser-mocks';
import { recordingContext } from '../../../apps/extension/src/offscreen/recording/context';
import { stageProjectExportInput } from '../../../apps/extension/src/composition/persistence/project-export-inputs';
import type { ProjectExportInputReference } from '../../../apps/extension/src/contracts/video/types/messages.export';
import type { VideoProject } from '../../../apps/extension/src/features/video/project/types';
import { createCanvasVideoOutput } from '../../../apps/extension/src/offscreen/recording/stream/canvas-video-output';
import { createRecordingArtifactSession } from '../../../apps/extension/src/offscreen/recording/encoding/artifact-session';
import { createLiveRecordingArtifactSession } from '../../../apps/extension/src/offscreen/recording/encoding/live-artifact-session';
import { LiveVideoOutputMetrics } from '../../../apps/extension/src/offscreen/recording/encoding/live-video-output-metrics';
import { createRecordingStagingCoordinator } from '../../../apps/extension/src/composition/persistence/recordings/staging';
import {
  createAssetObjectWriter,
  readAssetFile,
  type AssetObjectWriter,
} from '../../../apps/extension/src/composition/persistence/assets';
import { BlobSource, EncodedPacketSink, Input, WEBM } from 'mediabunny';

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

type LiveVfrRecordingResult = {
  backwardTimestamps: number;
  duplicateTimestamps: number;
  durationSpanMs: number;
  keyFrames: number;
  packetCount: number;
  summedDurationsMs: number;
};

type MostlyStaticLiveRecordingResult = {
  actualBitrate: number;
  averageInterframeBytes: number;
  backwardTimestamps: number;
  contentChangeRequests: number;
  duplicateTimestamps: number;
  durationSeconds: number;
  keyFrameByteShare: number;
  keyFrames: number;
  maximumGopInterval: number | null;
  minimumGopInterval: number | null;
  packetCount: number;
  withinByteBudget: boolean;
};

type OffscreenHarnessBridge = {
  recordCanvasCadence: (
    frameRate: number,
    recordingDurationMs: number
  ) => Promise<StaticCanvasRecordingResult>;
  reset: () => Promise<void>;
  stageProjectExportInput: (
    jobId: string,
    project: VideoProject
  ) => Promise<ProjectExportInputReference>;
  setMediaRecorderState: (state: HarnessMediaRecorderState) => void;
  getMediaRecorderState: () => HarnessMediaRecorderState;
  recordColdHighResolutionSequence: () => Promise<ColdHighResolutionRecordingResult[]>;
  recordLiveVfrArtifact: () => Promise<LiveVfrRecordingResult>;
  recordMostlyStaticLiveArtifact: () => Promise<MostlyStaticLiveRecordingResult>;
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

function createObservedAssetWriter(
  onAppend: (chunk: Blob) => void
): (input: { assetId?: string; mimeType: string }) => Promise<AssetObjectWriter> {
  return async (input) => {
    const writer = await createAssetObjectWriter(input);
    return {
      ...writer,
      async append(chunk) {
        onAppend(chunk);
        await writer.append(chunk);
      },
    };
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
    createWriter: createObservedAssetWriter(() => {
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

async function recordLiveVfrArtifact(): Promise<LiveVfrRecordingResult> {
  const width = 640;
  const height = 360;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('The browser exposes no canvas for the live VFR smoke');
  const stream = canvas.captureStream(0);
  const track = stream.getVideoTracks()[0] as MediaStreamTrack & { requestFrame?: () => void };
  if (typeof track?.requestFrame !== 'function') {
    throw new Error('The browser exposes no explicit canvas frame requests for the live VFR smoke');
  }
  track.contentHint = 'text';
  const coordinator = await createRecordingStagingCoordinator();
  let finalized = false;
  try {
    const session = await createLiveRecordingArtifactSession({
      artifactId: 'live-vfr-smoke',
      coordinator,
      encoding: {
        audioBitrate: 128_000,
        audioCodec: 'opus',
        container: 'webm',
        frameRate: 60,
        videoBitrate: 2_000_000,
        videoCodec: 'vp9',
      },
      filename: 'live-vfr-smoke.webm',
      mimeType: 'video/webm',
      stream,
    });
    const started = new Promise<void>((resolve, reject) => {
      session.setLifecycleCallbacks({ onFailure: reject, onStart: resolve });
    });
    session.start();
    const frameDelays = [0, 17, 34, 135, 152];
    const startedAt = performance.now();
    for (const [index, delay] of frameDelays.entries()) {
      const remaining = startedAt + delay - performance.now();
      if (remaining > 0) await new Promise<void>((resolve) => setTimeout(resolve, remaining));
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, width, height);
      context.fillStyle = '#111827';
      context.font = '32px sans-serif';
      context.fillText('Mostly static screen text', 40, 80);
      if (index % 2 === 0) context.fillRect(386, 48, 2, 38);
      track.requestFrame();
    }
    await started;
    await new Promise<void>((resolve) => setTimeout(resolve, 80));
    const artifact = await session.stop();
    const file = await readAssetFile(artifact.asset.ref, artifact.filename);
    const input = new Input({ formats: [WEBM], source: new BlobSource(file) });
    try {
      const videoTrack = await input.getPrimaryVideoTrack();
      if (!videoTrack) throw new Error('The live VFR artifact has no video track');
      const sink = new EncodedPacketSink(videoTrack);
      let packet = await sink.getFirstPacket();
      let packetCount = 0;
      let keyFrames = 0;
      let duplicateTimestamps = 0;
      let backwardTimestamps = 0;
      let summedDurations = 0;
      let firstTimestamp: number | null = null;
      let lastEndTimestamp: number | null = null;
      let previousTimestamp: number | null = null;
      while (packet) {
        packetCount += 1;
        if (packet.type === 'key') keyFrames += 1;
        firstTimestamp ??= packet.timestamp;
        lastEndTimestamp = packet.timestamp + packet.duration;
        summedDurations += packet.duration;
        if (previousTimestamp !== null) {
          if (packet.timestamp === previousTimestamp) duplicateTimestamps += 1;
          if (packet.timestamp < previousTimestamp) backwardTimestamps += 1;
        }
        previousTimestamp = packet.timestamp;
        packet = await sink.getNextPacket(packet);
      }
      finalized = true;
      return {
        backwardTimestamps,
        duplicateTimestamps,
        durationSpanMs:
          firstTimestamp === null || lastEndTimestamp === null
            ? 0
            : (lastEndTimestamp - firstTimestamp) * 1_000,
        keyFrames,
        packetCount,
        summedDurationsMs: summedDurations * 1_000,
      };
    } finally {
      input.dispose();
    }
  } finally {
    track.stop();
    if (finalized) await coordinator.delete();
    else await coordinator.abort().catch(() => undefined);
  }
}

async function recordMostlyStaticLiveArtifact(): Promise<MostlyStaticLiveRecordingResult> {
  const width = 640;
  const height = 360;
  const configuredBitrate = 2_000_000;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('The browser exposes no canvas for the static-content smoke');
  const stream = canvas.captureStream(0);
  const track = stream.getVideoTracks()[0] as MediaStreamTrack & { requestFrame?: () => void };
  if (typeof track?.requestFrame !== 'function') {
    throw new Error(
      'The browser exposes no explicit canvas frame requests for the static-content smoke'
    );
  }
  track.contentHint = 'text';
  const coordinator = await createRecordingStagingCoordinator();
  let finalized = false;
  try {
    const session = await createLiveRecordingArtifactSession({
      artifactId: 'mostly-static-live-smoke',
      coordinator,
      encoding: {
        audioBitrate: 128_000,
        audioCodec: 'opus',
        container: 'webm',
        frameRate: 60,
        videoBitrate: configuredBitrate,
        videoCodec: 'vp9',
      },
      filename: 'mostly-static-live-smoke.webm',
      mimeType: 'video/webm',
      stream,
    });
    const started = new Promise<void>((resolve, reject) => {
      session.setLifecycleCallbacks({ onFailure: reject, onStart: resolve });
    });
    session.start();
    const contentChangeRequests = 31;
    const startedAt = performance.now();
    for (let index = 0; index < contentChangeRequests; index += 1) {
      const targetTime = startedAt + index * 500;
      const remaining = targetTime - performance.now();
      if (remaining > 0) await new Promise<void>((resolve) => setTimeout(resolve, remaining));
      drawMostlyStaticScreen(context, { height, index, width });
      track.requestFrame();
    }
    await started;
    await new Promise<void>((resolve) => setTimeout(resolve, 80));
    const artifact = await session.stop();
    const file = await readAssetFile(artifact.asset.ref, artifact.filename);
    const result = await readMostlyStaticLiveMetrics(file, configuredBitrate);
    finalized = true;
    return { ...result, contentChangeRequests };
  } finally {
    track.stop();
    if (finalized) await coordinator.delete();
    else await coordinator.abort().catch(() => undefined);
  }
}

function drawMostlyStaticScreen(
  context: CanvasRenderingContext2D,
  input: { height: number; index: number; width: number }
): void {
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, input.width, input.height);
  context.fillStyle = '#111827';
  context.font = '26px sans-serif';
  context.fillText('Stable document text remains readable', 30, 70);
  context.font = '18px sans-serif';
  context.fillText(`Local revision ${Math.floor(input.index / 10)}`, 30, 112);
  if (input.index % 2 === 0) context.fillRect(474, 46, 2, 32);
}

async function readMostlyStaticLiveMetrics(
  file: File,
  configuredBitrate: number
): Promise<Omit<MostlyStaticLiveRecordingResult, 'contentChangeRequests'>> {
  const input = new Input({ formats: [WEBM], source: new BlobSource(file) });
  try {
    const videoTrack = await input.getPrimaryVideoTrack();
    if (!videoTrack) throw new Error('The static-content artifact has no video track');
    const sink = new EncodedPacketSink(videoTrack);
    const metrics = new LiveVideoOutputMetrics();
    let packet = await sink.getFirstPacket();
    while (packet) {
      metrics.observe(packet);
      packet = await sink.getNextPacket(packet);
    }
    const summary = metrics.summarize(configuredBitrate);
    return {
      actualBitrate: summary.videoByteBudget.actualBitrate,
      averageInterframeBytes: summary.averageInterframeBytes,
      backwardTimestamps: summary.backwardEncodedPacketTimestamps,
      duplicateTimestamps: summary.duplicateEncodedPacketTimestamps,
      durationSeconds: summary.duration,
      keyFrameByteShare: summary.keyFrameByteShare,
      keyFrames: summary.actualKeyFrames,
      maximumGopInterval: summary.maximumGopInterval,
      minimumGopInterval: summary.minimumGopInterval,
      packetCount: summary.encodedVideoFrames,
      withinByteBudget: summary.videoByteBudget.withinBudget,
    };
  } finally {
    input.dispose();
  }
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

async function recordCanvasCadence(
  frameRate: number,
  recordingDurationMs: number
): Promise<StaticCanvasRecordingResult> {
  const width = 854;
  const height = 480;
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

function recordStaticCanvasArtifact(): Promise<StaticCanvasRecordingResult> {
  return recordCanvasCadence(30, 1_200);
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
  recordLiveVfrArtifact,
  recordMostlyStaticLiveArtifact,
  recordCanvasCadence,
  recordStaticCanvasArtifact,
  stageProjectExportInput,
};

setReadyState(false);

void harnessReady.then(async () => {
  resetOffscreenHarnessState();
  await import('../../../apps/extension/src/offscreen/offscreen');
  setReadyState(true);
});
