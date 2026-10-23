import { getVideoClipSourceTime, normalizeClipPlaybackRate } from '../timeline/rate';
import type { VideoProject } from '../types/model';
import { fitCameraTransitionDurations, isMotionTransitionPhaseEdit } from './transitions';
import type {
  CameraTransitionPhase,
  CameraTransitionType,
  MotionTransitionPhaseEdit,
} from './transitions';
import type { VideoProjectMotionRegion } from '../types/interaction';

/** Checks the authored animation interval used by split zoom regions. */
export function isMotionAnimation(
  value: unknown
): value is NonNullable<VideoProjectMotionRegion['animation']> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'start' in value &&
    typeof value.start === 'number' &&
    Number.isFinite(value.start) &&
    value.start >= 0 &&
    'end' in value &&
    typeof value.end === 'number' &&
    Number.isFinite(value.end) &&
    value.end > value.start &&
    'duration' in value &&
    typeof value.duration === 'number' &&
    Number.isFinite(value.duration) &&
    value.duration >= value.end
  );
}

function sourceAnimationClock(
  region: VideoProjectMotionRegion,
  project?: Pick<VideoProject, 'clips'>
) {
  const binding = region.sourceBinding;
  const clip = project?.clips.find((item) => item.id === binding?.clipId);
  if (!binding || clip?.type !== 'VIDEO' || !clip.playbackWindow) return null;
  const window = clip.playbackWindow;
  const rate = normalizeClipPlaybackRate(clip.playbackRate ?? 1);
  const start = Math.max(
    binding.sourceStart,
    clip.sourceStart + Math.min(window.offset, window.holdAt ?? Infinity) * rate
  );
  const end = Math.min(
    binding.sourceEnd,
    clip.sourceStart + Math.min(clip.sourceDuration, (window.offset + clip.duration) * rate)
  );
  return end > start ? { clip, start, end, rate } : null;
}

/** Maps an offset within the visible region to its retained animation clock. */
export function getMotionAnimationTime(
  region: VideoProjectMotionRegion,
  offset: number,
  project?: Pick<VideoProject, 'clips'>
): number {
  const animation = region.animation;
  if (!animation || region.duration <= 0) return offset;
  const source = sourceAnimationClock(region, project);
  const progress = source
    ? Math.max(
        0,
        Math.min(
          1,
          (getVideoClipSourceTime(source.clip, region.startTime + offset) +
            (source.clip.cameraTiming?.offsetSeconds ?? 0) -
            source.start) /
            (source.end - source.start)
        )
      )
    : offset / region.duration;
  return animation.start + progress * (animation.end - animation.start);
}

/** Returns animation seconds per project second before a visual hold. */
export function getMotionAnimationRate(
  region: VideoProjectMotionRegion,
  project?: Pick<VideoProject, 'clips'>
): number {
  if (!region.animation) return 1;
  const source = sourceAnimationClock(region, project);
  const duration = source ? (source.end - source.start) / source.rate : region.duration;
  return (region.animation.end - region.animation.start) / duration;
}

/** Map the retained Native scalar name to the common camera curve for new window controls. */
export function motionTransitionTypeForEasing(
  easing: VideoProjectMotionRegion['easing']
): CameraTransitionType {
  return easing === 'LINEAR'
    ? 'linear'
    : easing === 'EASE_OUT'
      ? 'ease-out'
      : easing === 'INSTANT'
        ? 'instant'
        : 'ease-in-out';
}

function phaseType(
  region: VideoProjectMotionRegion,
  phase: CameraTransitionPhase
): CameraTransitionType {
  return region.phaseTransitions?.[phase] ?? motionTransitionTypeForEasing(region.easing);
}

function phaseDurations(region: VideoProjectMotionRegion) {
  const duration =
    (region.sourceBinding?.phaseProjection ? region.sourceBinding.animation.duration : undefined) ??
    region.animation?.duration ??
    region.sourceBinding?.animation.duration ??
    region.duration;
  const enter = { type: phaseType(region, 'enter'), duration: region.zoomInDuration };
  const exit = { type: phaseType(region, 'exit'), duration: region.zoomOutDuration };
  const a = region.phaseTransitions?.enter !== undefined;
  const b = region.phaseTransitions?.exit !== undefined;
  if (a && b) return fitCameraTransitionDurations(enter, exit, duration);
  if (a)
    return {
      enter:
        enter.type === 'none' ? 0 : Math.min(enter.duration, Math.max(0, duration - exit.duration)),
      exit: exit.duration,
    };
  if (b)
    return {
      enter: enter.duration,
      exit:
        exit.type === 'none' ? 0 : Math.min(exit.duration, Math.max(0, duration - enter.duration)),
    };
  return { enter: enter.duration, exit: exit.duration };
}

/** Window cameras use the shared curve; omitted scene phases keep the legacy scalar curve. */
export function motionTransitionSettings(
  region: VideoProjectMotionRegion,
  phase: CameraTransitionPhase
) {
  const type = phaseType(region, phase);
  return {
    type,
    duration: phaseDurations(region)[phase],
    explicit:
      region.sourceBinding?.coordinateSpace === 'source-window' ||
      region.phaseTransitions?.[phase] !== undefined,
    instant: type === 'instant',
  };
}

/** Merge one phase against current authoring, reserving the other phase without replacing it. */
export function editMotionTransitionPhase(
  region: VideoProjectMotionRegion,
  edit: MotionTransitionPhaseEdit
): VideoProjectMotionRegion | null {
  if (!isMotionTransitionPhaseEdit(edit)) return null;
  const current = motionTransitionSettings(region, edit.phase);
  const type = edit.type ?? current.type;
  // Inactive settings remain authored; only effective phase clocks consume time.
  const durationKey = edit.phase === 'enter' ? 'zoomInDuration' : 'zoomOutDuration';
  const remembered = region[durationKey];
  const requested =
    edit.duration ?? (type === 'none' || current.type === 'none' ? remembered : current.duration);
  const authorSmooth = edit.type === 'ease-in-out' && !current.explicit;
  const unchangedDuration = current.type === 'none' ? remembered : current.duration;
  if (!authorSmooth && type === current.type && requested === unchangedDuration) return region;
  const other = motionTransitionSettings(region, edit.phase === 'enter' ? 'exit' : 'enter');
  const duration =
    (region.sourceBinding?.phaseProjection ? region.sourceBinding.animation.duration : undefined) ??
    region.animation?.duration ??
    region.sourceBinding?.animation.duration ??
    region.duration;
  const next =
    type === 'none'
      ? Math.min(60, Math.max(0, requested))
      : Math.min(60, requested, Math.max(0, duration - other.duration));
  return {
    ...region,
    phaseTransitions: { ...region.phaseTransitions, [edit.phase]: type },
    [durationKey]: next,
  };
}
