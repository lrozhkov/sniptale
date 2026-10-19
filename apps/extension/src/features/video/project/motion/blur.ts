import { isBoundedNumber, isRecord } from '../validation/primitives';

const MOTION_BLUR_PHASES = ['enter', 'exit', 'link'] as const;
export type MotionBlurPhase = (typeof MOTION_BLUR_PHASES)[number];
interface MotionBlurSetting {
  enabled: boolean;
  strength: number;
}
export type MotionBlurPhases = Partial<Record<MotionBlurPhase, MotionBlurSetting>>;
/** Scalar edits merge inside the current project updater. */
export interface MotionBlurPhaseEdit {
  phase: MotionBlurPhase;
  enabled?: boolean;
  strength?: number;
}

/** Shared authored admission; missing settings remain absent and disabled values retain strength. */
export function parseMotionBlurPhases(value: unknown): MotionBlurPhases | undefined | null {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return null;
  const result: MotionBlurPhases = {};
  for (const phase of MOTION_BLUR_PHASES) {
    const setting = value[phase];
    if (setting === undefined) continue;
    if (
      !isRecord(setting) ||
      typeof setting['enabled'] !== 'boolean' ||
      !isBoundedNumber(setting['strength'], 0, 1)
    )
      return null;
    result[phase] = { enabled: setting['enabled'], strength: setting['strength'] };
  }
  return result;
}

/** Explicit sparse phases override the legacy scalar; absence retains legacy presentation. */
export function motionBlurPhaseSetting(
  phases: MotionBlurPhases | undefined,
  phase: MotionBlurPhase,
  legacy = 0
): MotionBlurSetting {
  return (
    phases?.[phase] ?? {
      enabled: phases === undefined && legacy > 0,
      strength: phases === undefined && legacy > 0 ? legacy : 0.5,
    }
  );
}

/** Retain untouched current phases and materialize legacy values only after a real edit. */
export function editMotionBlurPhase(
  phases: MotionBlurPhases | undefined,
  legacy: number,
  edit: MotionBlurPhaseEdit
): MotionBlurPhases | undefined | null {
  if (
    !MOTION_BLUR_PHASES.some((phase) => phase === edit.phase) ||
    (edit.enabled !== undefined && typeof edit.enabled !== 'boolean') ||
    (edit.strength !== undefined && !isBoundedNumber(edit.strength, 0, 1)) ||
    (edit.enabled === undefined && edit.strength === undefined)
  )
    return null;
  const current = motionBlurPhaseSetting(phases, edit.phase, legacy);
  const next = {
    ...current,
    ...(edit.enabled === undefined ? {} : { enabled: edit.enabled }),
    ...(edit.strength === undefined ? {} : { strength: edit.strength }),
  };
  if (next.enabled === current.enabled && next.strength === current.strength) return phases;
  const retained =
    phases ??
    Object.fromEntries(
      MOTION_BLUR_PHASES.map((phase) => [phase, motionBlurPhaseSetting(undefined, phase, legacy)])
    );
  return { ...retained, [edit.phase]: next };
}
