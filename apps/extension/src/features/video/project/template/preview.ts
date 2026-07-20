import type { TranslationKey } from '../../../../platform/i18n';

export const VideoTemplatePreviewTone = {
  CALM: 'CALM',
  EDITORIAL: 'EDITORIAL',
  GUIDED: 'GUIDED',
  HERO: 'HERO',
  TECHNICAL: 'TECHNICAL',
} as const;

export type VideoTemplatePreviewTone =
  (typeof VideoTemplatePreviewTone)[keyof typeof VideoTemplatePreviewTone];

export const VideoTemplatePreviewMotion = {
  DEPTH: 'DEPTH',
  DIP: 'DIP',
  FADE: 'FADE',
  FLIP: 'FLIP',
  FOCUS: 'FOCUS',
  PUSH: 'PUSH',
  REVEAL: 'REVEAL',
  SLIDE: 'SLIDE',
  SWEEP: 'SWEEP',
  WIPE: 'WIPE',
} as const;

export type VideoTemplatePreviewMotion =
  (typeof VideoTemplatePreviewMotion)[keyof typeof VideoTemplatePreviewMotion];

export const VideoTemplatePreviewVariant = {
  CALLOUT: 'CALLOUT',
  CTA: 'CTA',
  LOWER_THIRD: 'LOWER_THIRD',
  SPOTLIGHT: 'SPOTLIGHT',
  SUBTITLE: 'SUBTITLE',
  TITLE: 'TITLE',
  TRANSITION: 'TRANSITION',
} as const;

export type VideoTemplatePreviewVariant =
  (typeof VideoTemplatePreviewVariant)[keyof typeof VideoTemplatePreviewVariant];

export interface VideoTemplatePreviewMetadata {
  motionLabelKey: TranslationKey;
  tone: VideoTemplatePreviewTone;
  toneLabelKey: TranslationKey;
  variant: VideoTemplatePreviewVariant;
}

const VIDEO_TEMPLATE_PREVIEW_TONE_LABEL_KEYS = {
  [VideoTemplatePreviewTone.CALM]: 'videoEditor.templates.previewToneCalm',
  [VideoTemplatePreviewTone.EDITORIAL]: 'videoEditor.templates.previewToneEditorial',
  [VideoTemplatePreviewTone.GUIDED]: 'videoEditor.templates.previewToneGuided',
  [VideoTemplatePreviewTone.HERO]: 'videoEditor.templates.previewToneHero',
  [VideoTemplatePreviewTone.TECHNICAL]: 'videoEditor.templates.previewToneTechnical',
} as const satisfies Record<VideoTemplatePreviewTone, TranslationKey>;

const VIDEO_TEMPLATE_PREVIEW_MOTION_LABEL_KEYS = {
  [VideoTemplatePreviewMotion.DEPTH]: 'videoEditor.templates.previewMotionDepth',
  [VideoTemplatePreviewMotion.DIP]: 'videoEditor.templates.previewMotionDip',
  [VideoTemplatePreviewMotion.FADE]: 'videoEditor.templates.previewMotionFade',
  [VideoTemplatePreviewMotion.FLIP]: 'videoEditor.templates.previewMotionFlip',
  [VideoTemplatePreviewMotion.FOCUS]: 'videoEditor.templates.previewMotionFocus',
  [VideoTemplatePreviewMotion.PUSH]: 'videoEditor.templates.previewMotionPush',
  [VideoTemplatePreviewMotion.REVEAL]: 'videoEditor.templates.previewMotionReveal',
  [VideoTemplatePreviewMotion.SLIDE]: 'videoEditor.templates.previewMotionSlide',
  [VideoTemplatePreviewMotion.SWEEP]: 'videoEditor.templates.previewMotionSweep',
  [VideoTemplatePreviewMotion.WIPE]: 'videoEditor.templates.previewMotionWipe',
} as const satisfies Record<VideoTemplatePreviewMotion, TranslationKey>;

export function createVideoTemplatePreviewMetadata(
  tone: VideoTemplatePreviewTone,
  motion: VideoTemplatePreviewMotion,
  variant: VideoTemplatePreviewVariant
): VideoTemplatePreviewMetadata {
  return {
    motionLabelKey: VIDEO_TEMPLATE_PREVIEW_MOTION_LABEL_KEYS[motion],
    tone,
    toneLabelKey: VIDEO_TEMPLATE_PREVIEW_TONE_LABEL_KEYS[tone],
    variant,
  };
}
