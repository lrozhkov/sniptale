import { VideoTemporalEasing } from '../types/interaction';
import { isRecord, isBoundedNumber } from '../validation/primitives';

const TYPES = ['none', 'linear', 'ease-in-out', 'ease-out', 'instant'] as const;
export type CameraTransitionType = (typeof TYPES)[number];
export type CameraTransitionPhase = 'enter' | 'exit';
export interface CameraTransition<T extends CameraTransitionType = CameraTransitionType> {
  type: T;
  duration: number;
}
export type MotionPhaseTransitions = Partial<
  Record<CameraTransitionPhase, CameraTransitionType>
> & {
  /** Source-owned preference remains after its outgoing connection is removed. */
  link?: VideoTemporalEasing;
};
export interface MotionTransitionPhaseEdit {
  phase: CameraTransitionPhase;
  type?: CameraTransitionType;
  duration?: number;
}
export const DEFAULT_MOTION_PHASE_TRANSITIONS: MotionPhaseTransitions = {
  enter: 'ease-in-out',
  exit: 'ease-in-out',
};

/** The full editor retains its additional ease-out and instantaneous curves. */
function isCameraTransitionType(value: unknown): value is CameraTransitionType {
  return TYPES.some((type) => type === value);
}

/** Missing phase entries remain legacy; unknown keys do not enter the authored model. */
export function parseMotionPhaseTransitions(
  value: unknown
): MotionPhaseTransitions | undefined | null {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return null;
  const result: MotionPhaseTransitions = {};
  for (const phase of ['enter', 'exit'] as const) {
    const type = value[phase];
    if (type === undefined) continue;
    if (!isCameraTransitionType(type)) return null;
    result[phase] = type;
  }
  if (value['link'] !== undefined) {
    const link = Object.values(VideoTemporalEasing).find((curve) => curve === value['link']);
    if (!link) return null;
    result.link = link;
  }
  return result;
}

/** Single-phase commands validate scalar input before the current project mutates. */
export function isMotionTransitionPhaseEdit(edit: MotionTransitionPhaseEdit): boolean {
  return (
    (edit.phase === 'enter' || edit.phase === 'exit') &&
    (edit.type === undefined || isCameraTransitionType(edit.type)) &&
    (edit.duration === undefined || isBoundedNumber(edit.duration, 0, 60)) &&
    (edit.type !== undefined || edit.duration !== undefined)
  );
}

/** Gallery smoothstep is also the curve for explicitly authored Montage smooth phases. */
export function cameraTransitionProgress(progress: number, type: CameraTransitionType): number {
  const t = Math.max(0, Math.min(1, progress));
  switch (type) {
    case 'none':
      return 1;
    case 'instant':
      return t <= 0 ? 0 : 1;
    case 'linear':
      return t;
    case 'ease-out':
      return 1 - (1 - t) * (1 - t);
    case 'ease-in-out':
      return t * t * (3 - 2 * t);
  }
}

/** Derivatives use normalized time; consuming geometry applies the duration scale. */
export function cameraTransitionDerivative(
  progress: number,
  type: CameraTransitionType,
  order: 1 | 2
): number {
  const t = Math.max(0, Math.min(1, progress));
  switch (type) {
    case 'none':
    case 'instant':
      return 0;
    case 'linear':
      return order === 1 ? 1 : 0;
    case 'ease-out':
      return order === 1 ? 2 - 2 * t : -2;
    case 'ease-in-out':
      return order === 1 ? 6 * t * (1 - t) : 6 - 12 * t;
  }
}

/** Fit active phases proportionally; None never consumes animation time. */
export function fitCameraTransitionDurations(
  enter: CameraTransition,
  exit: CameraTransition,
  duration: number
) {
  const a = enter.type === 'none' ? 0 : enter.duration;
  const b = exit.type === 'none' ? 0 : exit.duration;
  const available = Math.max(0, duration);
  const total = a + b;
  const factor = total > available ? available / total : 1;
  const fittedEnter = a * factor;
  const fittedExit =
    total > available ? Math.min(b * factor, Math.max(0, available - fittedEnter)) : b;
  return { enter: fittedEnter, exit: fittedExit };
}
