import { getRecordingTelemetry } from '../../../composition/persistence/recordings/telemetry';
import { createLogger } from '@sniptale/platform/observability/logger';
import { saveRecordingTelemetrySafely } from '../../../workflows/media-hub/store';
import { RecordingTelemetrySignalKind } from '../../../features/video/project/types';
import {
  captureFrameSignature,
  createFrameSignatureCanvas,
  measureFrameDiff,
} from './static-frame-sampling';

const FRAME_SAMPLE_INTERVAL_SECONDS = 0.5;
const FRAME_DIFF_THRESHOLD = 3;
const FRAME_MIN_STATIC_SECONDS = 1.5;
const TELEMETRY_RETRY_ATTEMPTS = 8;
const TELEMETRY_RETRY_DELAY_MS = 250;

const logger = createLogger({ namespace: 'OffscreenStaticFrameSignals' });

function wait(delayMs: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, delayMs));
}

async function getTelemetryEntryWithRetry(recordingId: string) {
  for (let attempt = 0; attempt < TELEMETRY_RETRY_ATTEMPTS; attempt += 1) {
    const entry = await getRecordingTelemetry(recordingId);
    if (entry) {
      return entry;
    }

    await wait(TELEMETRY_RETRY_DELAY_MS);
  }

  return null;
}

async function loadVideo(blob: Blob): Promise<{
  cleanup: () => void;
  duration: number;
  video: HTMLVideoElement;
}> {
  const url = URL.createObjectURL(blob);
  const video = document.createElement('video');
  const cleanup = () => {
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(url);
    video.remove();
  };

  video.preload = 'auto';
  video.muted = true;
  video.playsInline = true;
  video.src = url;

  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () =>
        reject(new Error('Failed to load video metadata for static-frame pass'));
    });
  } catch (error) {
    cleanup();
    throw error;
  }

  return {
    cleanup,
    duration: video.duration,
    video,
  };
}

async function seekVideo(video: HTMLVideoElement, time: number): Promise<void> {
  if (Math.abs(video.currentTime - time) < 0.01) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const handleSeeked = () => {
      cleanup();
      resolve();
    };
    const handleError = () => {
      cleanup();
      reject(new Error('Failed to seek video during static-frame pass'));
    };
    const cleanup = () => {
      video.removeEventListener('seeked', handleSeeked);
      video.removeEventListener('error', handleError);
    };

    video.addEventListener('seeked', handleSeeked, { once: true });
    video.addEventListener('error', handleError, { once: true });
    video.currentTime = Math.max(0, time);
  });
}

type StaticSignalWindow = {
  maxDiff: number;
  staticEnd: number;
  staticStart: number | null;
};

type StaticSignal = {
  endTime: number;
  maxDiff: number;
  startTime: number;
};

function resetStaticSignalWindow(): StaticSignalWindow {
  return {
    maxDiff: 0,
    staticEnd: 0,
    staticStart: null,
  };
}

function flushStaticSignalWindow(
  signals: StaticSignal[],
  window: StaticSignalWindow
): StaticSignalWindow {
  if (
    window.staticStart !== null &&
    window.staticEnd - window.staticStart >= FRAME_MIN_STATIC_SECONDS
  ) {
    signals.push({
      endTime: window.staticEnd,
      maxDiff: window.maxDiff,
      startTime: window.staticStart,
    });
  }

  return resetStaticSignalWindow();
}

function updateStaticSignalWindow(params: {
  clampedTime: number;
  diff: number;
  previousTime: number;
  signals: StaticSignal[];
  window: StaticSignalWindow;
}): StaticSignalWindow {
  const { clampedTime, diff, previousTime, signals, window } = params;
  if (diff <= FRAME_DIFF_THRESHOLD) {
    return {
      staticStart: window.staticStart ?? previousTime,
      staticEnd: clampedTime,
      maxDiff: Math.max(window.maxDiff, diff),
    };
  }

  return flushStaticSignalWindow(signals, window);
}

function createStaticFrameTelemetrySignals(signals: StaticSignal[]) {
  return signals.map((signal) => ({
    id: crypto.randomUUID(),
    kind: RecordingTelemetrySignalKind.STATIC_FRAME,
    startTime: signal.startTime,
    endTime: signal.endTime,
    point: null,
    data: {
      maxDiff: Number(signal.maxDiff.toFixed(2)),
    },
  }));
}

async function detectStaticFrameSignals(blob: Blob) {
  const { cleanup, duration, video } = await loadVideo(blob);
  const canvas = createFrameSignatureCanvas();
  const ctx = canvas.getContext('2d');

  if (!ctx || !Number.isFinite(duration) || duration <= 0) {
    cleanup();
    return [];
  }

  let previousFrame: Uint8ClampedArray | null = null;
  let previousTime = 0;
  let staticWindow = resetStaticSignalWindow();
  const signals: StaticSignal[] = [];

  try {
    for (let time = 0; time <= duration + 0.001; time += FRAME_SAMPLE_INTERVAL_SECONDS) {
      const clampedTime = Math.min(time, duration);
      await seekVideo(video, clampedTime);
      const frame = captureFrameSignature(ctx, canvas, video);

      if (previousFrame !== null) {
        const diff = measureFrameDiff(previousFrame, frame);
        staticWindow = updateStaticSignalWindow({
          clampedTime,
          diff,
          previousTime,
          signals,
          window: staticWindow,
        });
      }

      previousFrame = frame;
      previousTime = clampedTime;
    }
    flushStaticSignalWindow(signals, staticWindow);
  } finally {
    cleanup();
  }

  return createStaticFrameTelemetrySignals(signals);
}

export async function persistStaticFrameSignals(recordingId: string, blob: Blob): Promise<void> {
  try {
    const entry = await getTelemetryEntryWithRetry(recordingId);
    if (!entry) {
      logger.warn('Skipping static-frame pass because telemetry sidecar is unavailable', {
        recordingId,
      });
      return;
    }

    const staticSignals = await detectStaticFrameSignals(blob);
    const baseSignals = entry.signals.filter(
      (signal) => signal.kind !== RecordingTelemetrySignalKind.STATIC_FRAME
    );

    await saveRecordingTelemetrySafely({
      ...entry,
      updatedAt: Date.now(),
      signals: [...baseSignals, ...staticSignals],
    });
  } catch (error) {
    logger.warn('Static-frame post-pass failed', {
      errorMessage: error instanceof Error ? error.message : String(error),
      recordingId,
    });
  }
}
