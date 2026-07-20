import type { EditorStepSettings as StepSettings } from '../../../../features/editor/document/step-types';

function sizeLevelToMultiplier(level: number): number {
  if (level <= 3) {
    return 1 + (level / 3) * 0.35;
  }

  return 1.35 + ((level - 3) / 3) * 0.45;
}

export function resolveStepGroupGeometry(sizeLevel: StepSettings['sizeLevel']) {
  const multiplier = sizeLevelToMultiplier(sizeLevel);
  const radius = 16 * multiplier;
  const fontSize = 17 * multiplier;

  return {
    radius,
    fontSize,
    strokeWidth: Math.max(2, radius * 0.12),
    textTop: -fontSize * 0.05,
    textWidth: radius * 1.7,
  };
}

export type StepGroupGeometry = ReturnType<typeof resolveStepGroupGeometry>;
