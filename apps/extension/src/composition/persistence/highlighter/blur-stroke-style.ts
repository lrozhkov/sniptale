import type { BlurSettings } from '../../../features/highlighter/contracts';
import { isStringLiteralValue } from '@sniptale/runtime-contracts/validation/string-literals';

const BLUR_STROKE_STYLES = [
  'solid',
  'dashed',
  'dotted',
  'dash',
  'dot',
  'dash-dot',
  'long-dash',
] as const satisfies readonly NonNullable<BlurSettings['strokeStyle']>[];

export function isBlurStrokeStyle(
  value: unknown
): value is NonNullable<BlurSettings['strokeStyle']> {
  return isStringLiteralValue(value, BLUR_STROKE_STYLES);
}
