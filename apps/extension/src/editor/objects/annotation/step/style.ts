import type { EditorStepSettings as StepSettings } from '../../../../features/editor/document/step-types';
import { clamp } from '../../../document/model';

export function resolveStepOpacity(value: number): number {
  return Number.isFinite(value) ? clamp(value, 0, 1) : 1;
}

export function resolveStepText(settings: StepSettings): string {
  if (settings.value) {
    return settings.value;
  }

  return settings.type === 'manual' ? '' : '1';
}
