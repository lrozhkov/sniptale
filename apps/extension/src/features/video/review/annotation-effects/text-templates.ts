import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { createReviewAnnotationTextClip } from './text-animation';
import {
  legacyReviewTextAppearance,
  parseReviewTextAppearance,
  type ReviewTextAppearance,
} from './text-appearance';
import type { ReviewAnnotationTextClip } from './types';
import { parseTextLoop, parseTextTransition } from './validation';

export type ReviewTextTemplate = Pick<
  ReviewAnnotationTextClip,
  'color' | 'fontSize' | 'entrance' | 'loop' | 'exit'
> & { version: 1; appearance: ReviewTextAppearance };

/** A template contains appearance and motion only. It has no project or clip identity. */
export function parseReviewTextTemplate(raw: unknown): ReviewTextTemplate | null {
  if (
    !isRecord(raw) ||
    raw['version'] !== 1 ||
    typeof raw['color'] !== 'string' ||
    !/^#[0-9a-f]{6}$/iu.test(raw['color']) ||
    typeof raw['fontSize'] !== 'number' ||
    !Number.isFinite(raw['fontSize']) ||
    raw['fontSize'] < 0.005 ||
    raw['fontSize'] > 0.5
  )
    return null;
  const appearance = parseReviewTextAppearance(raw['appearance']);
  const entrance = parseTextTransition(raw['entrance']);
  const loop = parseTextLoop(raw['loop']);
  const exit = parseTextTransition(raw['exit']);
  if (!appearance || !entrance || !loop || !exit) return null;
  return {
    version: 1,
    color: raw['color'],
    fontSize: raw['fontSize'],
    appearance,
    entrance,
    loop,
    exit,
  };
}

export function captureReviewTextTemplate(clip: ReviewAnnotationTextClip): ReviewTextTemplate {
  const { color, fontSize, entrance, loop, exit } = clip;
  const settings = {
    version: 1 as const,
    color,
    fontSize,
    appearance: clip.appearance ?? legacyReviewTextAppearance,
    entrance,
    loop,
    exit,
  };
  // Canonical keys keep comparisons stable across project and profile reads.
  return parseReviewTextTemplate(settings) ?? structuredClone(settings);
}

export function applyReviewTextTemplate(
  clip: ReviewAnnotationTextClip,
  { version: _version, ...template }: ReviewTextTemplate
): ReviewAnnotationTextClip {
  return { ...clip, ...structuredClone(template) };
}

const defaults = captureReviewTextTemplate(createReviewAnnotationTextClip('', '', 0, 1, 0));
const clean: ReviewTextTemplate = {
  ...defaults,
  color: '#fffdf9',
  appearance: {
    ...legacyReviewTextAppearance,
    family: 'golos',
    outline: { ...legacyReviewTextAppearance.outline, enabled: false },
    shadow: { ...legacyReviewTextAppearance.shadow, enabled: true, opacity: 0.7, blur: 0.13 },
  },
};
const block: ReviewTextTemplate = {
  ...clean,
  appearance: {
    ...clean.appearance,
    background: { ...clean.appearance.background, mode: 'block' },
    shadow: { ...clean.appearance.shadow, enabled: false },
  },
  entrance: { ...clean.entrance, preset: 'fade', duration: 0.28 },
  exit: { ...clean.exit, preset: 'fade', duration: 0.25 },
};
const marker: ReviewTextTemplate = {
  ...block,
  color: '#231b13',
  appearance: {
    ...block.appearance,
    weight: 700,
    align: 'left',
    background: {
      ...block.appearance.background,
      mode: 'marker',
      color: '#ffdf73',
      opacity: 1,
      paddingX: 0.17,
      paddingY: 0.035,
    },
  },
  entrance: { ...clean.entrance, preset: 'cascade', duration: 0.42, distance: 0.32 },
};

const editorial: ReviewTextTemplate = {
  ...clean,
  color: '#fff8ec',
  fontSize: 0.088,
  appearance: {
    ...clean.appearance,
    family: 'literata',
    weight: 500,
    lineHeight: 1.3,
    letterSpacing: 0.065,
    shadow: { ...clean.appearance.shadow, opacity: 0.72, blur: 0.14 },
  },
  entrance: { ...clean.entrance, preset: 'fade', duration: 0.38 },
  exit: { ...clean.exit, preset: 'fade', duration: 0.32 },
};
const terminal: ReviewTextTemplate = {
  ...block,
  color: '#adf2c5',
  appearance: {
    ...block.appearance,
    family: 'jetbrains-mono',
    weight: 500,
    lineHeight: 1.22,
    align: 'left',
    background: {
      ...block.appearance.background,
      color: '#111c19',
      opacity: 0.94,
      radius: 0.18,
    },
  },
  entrance: { ...clean.entrance, preset: 'typewriter', duration: 0.48 },
};
const poster: ReviewTextTemplate = {
  ...clean,
  color: '#ff9566',
  fontSize: 0.117,
  appearance: {
    ...clean.appearance,
    family: 'oswald',
    weight: 700,
    lineHeight: 1.12,
    letterSpacing: 0.02,
    outline: { enabled: true, color: '#251417', opacity: 0.95, width: 0.075 },
    shadow: { ...clean.appearance.shadow, x: 0.035, y: 0.08, opacity: 0.7, blur: 0.12 },
  },
  entrance: { ...clean.entrance, preset: 'pop', duration: 0.33 },
  exit: { ...clean.exit, preset: 'fade', duration: 0.22 },
};

export const REVIEW_TEXT_TEMPLATE_IDS = [
  'clean',
  'block',
  'marker',
  'editorial',
  'terminal',
  'poster',
] as const;
export const reviewBuiltinTextTemplates = {
  clean,
  block,
  marker,
  editorial,
  terminal,
  poster,
} satisfies Record<(typeof REVIEW_TEXT_TEMPLATE_IDS)[number], ReviewTextTemplate>;
