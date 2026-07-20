import type { RecordingTelemetryEntry } from '../../../composition/persistence/recordings/contracts';
import type {
  CaptureMode,
  VideoDisplaySurface,
  ViewportInfo,
} from '@sniptale/runtime-contracts/video/types/types';
import type {
  VideoProject,
  VideoProjectActionEvent,
  VideoProjectActionPoint,
  VideoProjectCursorTrack,
} from '../../../features/video/project/types';

type NormalizeRecordingTelemetryParams = {
  captureMode: CaptureMode | null;
  displaySurface: VideoDisplaySurface | null;
  projectHeight: number;
  projectWidth: number;
  viewport: ViewportInfo | null;
};

export function createRecordingTelemetryNormalizationParams(
  telemetry: Pick<RecordingTelemetryEntry, 'captureMode' | 'displaySurface' | 'viewport'>,
  project: Pick<VideoProject, 'height' | 'width'>
): NormalizeRecordingTelemetryParams {
  return {
    captureMode: telemetry.captureMode ?? null,
    displaySurface: telemetry.displaySurface ?? null,
    projectHeight: project.height,
    projectWidth: project.width,
    viewport: telemetry.viewport,
  };
}

type Point = {
  x: number;
  y: number;
};

function clampCoordinate(value: number, max: number): number {
  return Math.min(Math.max(0, value), max);
}

function resolveSourceBounds(params: NormalizeRecordingTelemetryParams) {
  if (params.viewport === null) {
    return null;
  }

  if (params.captureMode !== 'SCREEN' || params.displaySurface !== 'window') {
    return {
      height: params.viewport.height,
      offsetX: 0,
      offsetY: 0,
      width: params.viewport.width,
    };
  }

  const outerWidth = Math.max(params.viewport.width, params.viewport.outerWidth ?? 0);
  const outerHeight = Math.max(params.viewport.height, params.viewport.outerHeight ?? 0);
  return {
    height: outerHeight,
    offsetX: Math.max(0, params.viewport.viewportOffsetX ?? 0),
    offsetY: Math.max(0, params.viewport.viewportOffsetY ?? 0),
    width: outerWidth,
  };
}

function normalizePoint(
  point: Point,
  params: NormalizeRecordingTelemetryParams
): VideoProjectActionPoint {
  const bounds = resolveSourceBounds(params);
  if (bounds === null || bounds.width <= 0 || bounds.height <= 0) {
    return point;
  }

  const scaleX = params.projectWidth / bounds.width;
  const scaleY = params.projectHeight / bounds.height;
  return {
    x: clampCoordinate((point.x + bounds.offsetX) * scaleX, params.projectWidth),
    y: clampCoordinate((point.y + bounds.offsetY) * scaleY, params.projectHeight),
  };
}

export function normalizeRecordingCursorTrackToProjectSpace(
  cursorTrack: VideoProjectCursorTrack | null,
  params: NormalizeRecordingTelemetryParams
): VideoProjectCursorTrack | null {
  if (cursorTrack === null) {
    return cursorTrack;
  }

  return {
    ...cursorTrack,
    samples: cursorTrack.samples.map((sample) => {
      const point = normalizePoint({ x: sample.x, y: sample.y }, params);
      return {
        ...sample,
        x: point.x,
        y: point.y,
      };
    }),
  };
}

export function normalizeRecordingActionEventsToProjectSpace(
  actionEvents: VideoProjectActionEvent[],
  params: NormalizeRecordingTelemetryParams
): VideoProjectActionEvent[] {
  return actionEvents.map((event) => ({
    ...event,
    ...(event.point === null ? {} : { point: normalizePoint(event.point, params) }),
  }));
}
