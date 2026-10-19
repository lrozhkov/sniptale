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

/** Maps an offset within the visible region to its retained animation clock. */
export function getMotionAnimationTime(region: VideoProjectMotionRegion, offset: number): number {
  const animation = region.animation;
  return animation && region.duration > 0
    ? animation.start + (offset / region.duration) * (animation.end - animation.start)
    : offset;
}

function phaseType(
  region: VideoProjectMotionRegion,
  phase: CameraTransitionPhase
): CameraTransitionType {
  return (
    region.phaseTransitions?.[phase] ??
    (region.easing === 'LINEAR'
      ? 'linear'
      : region.easing === 'EASE_OUT'
        ? 'ease-out'
        : region.easing === 'INSTANT'
          ? 'instant'
          : 'ease-in-out')
  );
}

function phaseDurations(region: VideoProjectMotionRegion) {
  const duration =
    region.animation?.duration ?? region.sourceBinding?.animation.duration ?? region.duration;
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

/** Explicit phases use the shared curve; an omitted phase keeps the legacy scalar curve. */
export function motionTransitionSettings(
  region: VideoProjectMotionRegion,
  phase: CameraTransitionPhase
) {
  const type = phaseType(region, phase);
  return {
    type,
    duration: phaseDurations(region)[phase],
    explicit: region.phaseTransitions?.[phase] !== undefined,
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
  const requested = edit.duration ?? current.duration;
  const authorSmooth = edit.type === 'ease-in-out' && !current.explicit;
  if (!authorSmooth && type === current.type && requested === current.duration) return region;
  const other = motionTransitionSettings(region, edit.phase === 'enter' ? 'exit' : 'enter');
  const duration =
    region.animation?.duration ?? region.sourceBinding?.animation.duration ?? region.duration;
  const next =
    type === 'none' ? 0 : Math.min(60, requested, Math.max(0, duration - other.duration));
  return {
    ...region,
    phaseTransitions: { ...region.phaseTransitions, [edit.phase]: type },
    [edit.phase === 'enter' ? 'zoomInDuration' : 'zoomOutDuration']: next,
  };
}
