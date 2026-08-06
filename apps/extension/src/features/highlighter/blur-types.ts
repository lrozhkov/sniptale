import type { BlurType } from './contracts';

export const AVAILABLE_HIGHLIGHTER_BLUR_TYPES = [
  'gaussian',
  'distortion',
  'solid',
] as const satisfies readonly BlurType[];
