import { resolveClipTransitionVisualState } from '../../../project/transition/presentation';
import { getFittedMediaContentFrame } from '../../draw/fitted-media';
import type { VisualLayerSourcePointMapping } from '../../draw/fitted-media';
import { normalizeVideoProjectCursorSkin } from '../../../project/cursor';
import { resolveVideoProjectActionOccurrences } from '../../../project/action-occurrences';
import type { VideoProject, VideoProjectCursorSample } from '../../../project/types/index';
import { VideoCursorCaptureMode, VideoTemporalEasing } from '../../../project/types/index';
import { applyTemporalEasing } from '../../motion/math';
import type { VideoCompositionActionState, VideoCompositionCursorState } from '../../types';

/** Evaluates the retained easing curve between two cursor keys. */
export function interpolateCursorSample(
  previousSample: VideoProjectCursorSample,
  nextSample: VideoProjectCursorSample,
  currentTime: number
): VideoProjectCursorSample {
  const duration = nextSample.time - previousSample.time;
  if (duration <= 0) {
    return previousSample;
  }

  const easing = previousSample.interpolation ?? VideoTemporalEasing.LINEAR;
  const range = previousSample.interpolationRange ?? { start: 0, end: 1 };
  const start = applyTemporalEasing(range.start, easing);
  const end = applyTemporalEasing(range.end, easing);
  const value = applyTemporalEasing(
    range.start + ((currentTime - previousSample.time) / duration) * (range.end - range.start),
    easing
  );
  const progress = end > start ? (value - start) / (end - start) : 0;

  return {
    ...previousSample,
    time: currentTime,
    visible: previousSample.visible,
    x: previousSample.x + (nextSample.x - previousSample.x) * progress,
    y: previousSample.y + (nextSample.y - previousSample.y) * progress,
  };
}

export function resolveCursorSample(
  project: VideoProject,
  currentTime: number,
  sourceClipId?: string
): VideoProjectCursorSample | null {
  const samples = project.cursorTrack?.samples ?? [];
  if (samples.length === 0) {
    return null;
  }

  const { previousSample, nextSample } = cursorSamplesAtTime(project, currentTime, sourceClipId);

  if (!previousSample) {
    return null;
  }
  if (previousSample.sourceAnchor) {
    const owner = project.clips.find(({ id }) => id === previousSample.sourceAnchor?.sourceClipId);
    if (!owner || currentTime < owner.startTime || currentTime >= owner.startTime + owner.duration)
      return null;
  }

  if (project.cursorTrack?.captureMode === VideoCursorCaptureMode.EMBEDDED_FALLBACK) {
    return previousSample;
  }

  const continuous = cursorSamplesContinuous(previousSample, nextSample);
  return continuous && nextSample
    ? interpolateCursorSample(previousSample, nextSample, currentTime)
    : previousSample;
}

function cursorSamplesContinuous(
  previous: VideoProjectCursorSample,
  next: VideoProjectCursorSample | null
): next is VideoProjectCursorSample {
  return (
    !!next &&
    previous.visible &&
    (!next.observation || next.observation === 'observed') &&
    previous.captureSegment === next.captureSegment &&
    previous.sourceAnchor?.sourceClipId === next.sourceAnchor?.sourceClipId
  );
}

/** Bound one rendered key interval before camera transforms. Callers split at sample and clip boundaries. */
export function boundRenderedCursorPosition(project: VideoProject, start: number, end: number) {
  const { previousSample: previous, nextSample: next } = cursorSamplesAtTime(
    project,
    (start + end) / 2,
    undefined
  );
  if ((previous && start < previous.time) || (next && end > next.time))
    throw new Error('Rendered cursor bounds require one key interval.');
  if (!previous?.visible || resolveCursorSkin(project, previous).hidden) return null;
  const owner =
    previous.sourceAnchor &&
    project.clips.find((clip) => clip.id === previous.sourceAnchor?.sourceClipId);
  const middle = (start + end) / 2;
  if (
    previous.sourceAnchor &&
    (!owner || middle < owner.startTime || middle >= owner.startTime + owner.duration)
  )
    return null;
  const continuous =
    project.cursorTrack?.captureMode !== VideoCursorCaptureMode.EMBEDDED_FALLBACK &&
    cursorSamplesContinuous(previous, next);
  const from = continuous && next ? interpolateCursorSample(previous, next, start) : previous;
  const to = continuous && next ? interpolateCursorSample(previous, next, end) : previous;
  return {
    minX: Math.min(from.x, to.x),
    maxX: Math.max(from.x, to.x),
    minY: Math.min(from.y, to.y),
    maxY: Math.max(from.y, to.y),
  };
}

function resolveCursorSkin(project: VideoProject, sample: VideoProjectCursorSample) {
  return normalizeVideoProjectCursorSkin(sample.skinOverride ?? project.cursorTrack?.skin);
}

export function resolveVideoCompositionCursor(
  project: VideoProject,
  currentTime: number,
  _actions: VideoCompositionActionState[]
): VideoCompositionCursorState | null {
  const cursorTrack = project.cursorTrack;
  if (!cursorTrack) {
    return null;
  }

  const sample = resolveCursorSample(project, currentTime);
  if (!sample || !sample.visible) {
    return null;
  }

  const skin = resolveCursorSkin(project, sample);
  if (skin.hidden) {
    return null;
  }

  return {
    animationPreset: skin.animationPreset,
    captureMode: cursorTrack.captureMode,
    color: skin.color,
    preset: skin.preset,
    scale:
      skin.scale *
      (skin.animationPreset === 'PRESS' ? resolveClickPressScale(project, currentTime) : 1),
    shadow: skin.shadow,
    time: currentTime,
    visible: true,
    x: sample.x,
    y: sample.y,
  };
}

/** Feedback is tied to an actual click, never an idle oscillation or zoom region. */
function resolveClickPressScale(project: VideoProject, currentTime: number): number {
  const click = resolveVideoProjectActionOccurrences(project).find(
    (item) =>
      item.event.kind === 'CLICK' && currentTime >= item.time && currentTime < item.time + 0.25
  );
  return click ? 1 - 0.18 * Math.sin(((currentTime - click.time) / 0.25) * Math.PI) : 1;
}

/** Shared source geometry for cursor focus, actual containment, and canvas authoring. */
export function resolveCursorSourcePointMapping(
  project: VideoProject,
  sourceClipId: string | undefined,
  time: number
): Omit<VisualLayerSourcePointMapping, 'point'> | null {
  if (!sourceClipId) return null;
  const clip = project.clips.find((item) => item.id === sourceClipId);
  if (clip?.type !== 'VIDEO') return null;
  const asset = project.assets.find((item) => item.id === clip.assetId);
  if (!asset) return null;
  return {
    frame: clip.transform,
    fitMode: clip.fitMode,
    sourceWidth: asset.metadata.width,
    sourceHeight: asset.metadata.height,
    ...(clip.windowHeader ? { windowHeader: clip.windowHeader } : {}),
    renderState: resolveClipTransitionVisualState(project, clip, time),
  };
}

const cursorSampleScopes = new WeakMap<VideoProject, Map<string, VideoProjectCursorSample[]>>();
function scopedCursorSamples(
  project: VideoProject,
  sourceClipId: string | undefined
): VideoProjectCursorSample[] {
  let scopes = cursorSampleScopes.get(project);
  if (!scopes) {
    scopes = new Map();
    cursorSampleScopes.set(project, scopes);
  }
  const scope = sourceClipId ?? 'project';
  let samples = scopes.get(scope);
  if (!samples) {
    samples = (project.cursorTrack?.samples ?? [])
      .filter((sample) => !sourceClipId || sample.sourceAnchor?.sourceClipId === sourceClipId)
      .toSorted((a, b) => a.time - b.time || a.id.localeCompare(b.id));
    scopes.set(scope, samples);
  }
  return samples;
}

/** Unbounded author controls use the same media affine transform without rewriting their values. */
export function mapCursorFocusControlPoint(
  mapping: Omit<VisualLayerSourcePointMapping, 'point'>,
  point: { x: number; y: number },
  inverse = false
) {
  const content = getFittedMediaContentFrame(mapping);
  const center = {
    x: mapping.frame.x + mapping.frame.width / 2,
    y: mapping.frame.y + mapping.frame.height / 2,
  };
  const angle = (mapping.frame.rotation * Math.PI) / 180;
  if (inverse) {
    const x = (point.x - center.x - mapping.renderState.translateX) / mapping.renderState.scaleX;
    const y = (point.y - center.y - mapping.renderState.translateY) / mapping.renderState.scaleY;
    return {
      x: (center.x + x * Math.cos(angle) + y * Math.sin(angle) - content.x) / content.width,
      y: (center.y - x * Math.sin(angle) + y * Math.cos(angle) - content.y) / content.height,
    };
  }
  const x = content.x + point.x * content.width - center.x;
  const y = content.y + point.y * content.height - center.y;
  return {
    x:
      center.x +
      mapping.renderState.translateX +
      mapping.renderState.scaleX * (x * Math.cos(angle) - y * Math.sin(angle)),
    y:
      center.y +
      mapping.renderState.translateY +
      mapping.renderState.scaleY * (x * Math.sin(angle) + y * Math.cos(angle)),
  };
}

function cursorSamplesAtTime(
  project: VideoProject,
  time: number,
  sourceClipId: string | undefined
) {
  const ordered = scopedCursorSamples(project, sourceClipId);
  let low = 0;
  let high = ordered.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (ordered[middle]!.time <= time) low = middle + 1;
    else high = middle;
  }
  return { previousSample: ordered[low - 1] ?? null, nextSample: ordered[low] ?? null };
}

/** Trusted observation interpolation is independent of focus edits and cursor skin/capture mode. */
export function resolveObservedCursorPosition(
  project: VideoProject,
  time: number,
  sourceClipId?: string,
  options?: { includeSourceEnd?: boolean }
): VideoProjectCursorSample | null {
  const owner =
    options?.includeSourceEnd && sourceClipId
      ? project.clips.find(
          (clip) =>
            clip.id === sourceClipId && clip.duration > 0 && time === clip.startTime + clip.duration
        )
      : undefined;
  // A closing proof owns the left source at its exact endpoint. Playback keeps its ordinary half-open dispatch.
  const sample = owner
    ? cursorSamplesAtTime(project, time, sourceClipId).previousSample
    : resolveCursorSample(project, time, sourceClipId);
  if (
    !sample?.visible ||
    sample.recordingPoint === null ||
    (sample.sourceAnchor && sample.recordingPoint === undefined) ||
    (sample.observation && sample.observation !== 'observed')
  )
    return null;
  const { previousSample, nextSample } = cursorSamplesAtTime(project, time, sourceClipId);
  if (
    !previousSample ||
    !nextSample?.visible ||
    nextSample.recordingPoint === null ||
    (nextSample.observation && nextSample.observation !== 'observed') ||
    previousSample.captureSegment !== nextSample.captureSegment ||
    previousSample.sourceAnchor?.sourceClipId !== nextSample.sourceAnchor?.sourceClipId
  )
    return sample;
  const point = interpolateCursorSample(
    { ...previousSample, interpolation: 'LINEAR' },
    nextSample,
    time
  );
  const progress = (time - previousSample.time) / (nextSample.time - previousSample.time);
  return {
    ...point,
    ...(previousSample.recordingPoint && nextSample.recordingPoint
      ? {
          recordingPoint: {
            x:
              previousSample.recordingPoint.x +
              (nextSample.recordingPoint.x - previousSample.recordingPoint.x) * progress,
            y:
              previousSample.recordingPoint.y +
              (nextSample.recordingPoint.y - previousSample.recordingPoint.y) * progress,
          },
        }
      : {}),
  };
}
