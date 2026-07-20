import { resolveScenarioColorToken } from '../../../../../features/scenario/project/v3/color-token';

export function resolveSvgPaint(value: string, fallback: string): string {
  return resolveScenarioColorToken(value, fallback);
}
