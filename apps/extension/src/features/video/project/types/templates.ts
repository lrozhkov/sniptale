export const VideoOverlayTemplateKind = {
  LOWER_THIRD_BASIC: 'LOWER_THIRD_BASIC',
  LOWER_THIRD_ACCENT: 'LOWER_THIRD_ACCENT',
  LOWER_THIRD_EDITORIAL: 'LOWER_THIRD_EDITORIAL',
  LOWER_THIRD_STACKED: 'LOWER_THIRD_STACKED',
  LOWER_THIRD_BADGE: 'LOWER_THIRD_BADGE',
  LOWER_THIRD_STATUS_TICKER: 'LOWER_THIRD_STATUS_TICKER',
  CALLOUT_CARD: 'CALLOUT_CARD',
  CALLOUT_CONNECTOR: 'CALLOUT_CONNECTOR',
  CALLOUT_NOTIFICATION_BANNER: 'CALLOUT_NOTIFICATION_BANNER',
  POINTER_LABEL: 'POINTER_LABEL',
  FEATURE_SPOTLIGHT_CARD: 'FEATURE_SPOTLIGHT_CARD',
  FOCUS_SCAN_FRAME: 'FOCUS_SCAN_FRAME',
  SIDE_NOTE: 'SIDE_NOTE',
  TITLE_REVEAL: 'TITLE_REVEAL',
  SECTION_DIVIDER: 'SECTION_DIVIDER',
  TITLE_CURSOR_REVEAL: 'TITLE_CURSOR_REVEAL',
  SHIMMER_LABEL: 'SHIMMER_LABEL',
  SIDE_REVEAL_PANEL: 'SIDE_REVEAL_PANEL',
  SCENE_PROGRESS_CARD: 'SCENE_PROGRESS_CARD',
  THREE_D_REVEAL_CARD: 'THREE_D_REVEAL_CARD',
} as const;

export type VideoOverlayTemplateKind =
  (typeof VideoOverlayTemplateKind)[keyof typeof VideoOverlayTemplateKind];

export const VideoBlockKind = {
  KINETIC_CAPTIONS: 'KINETIC_CAPTIONS',
  STEP_EXPLAINER: 'STEP_EXPLAINER',
  CHAPTER_OPENER: 'CHAPTER_OPENER',
  FEATURE_SPOTLIGHT: 'FEATURE_SPOTLIGHT',
  SPEAKER_INTRO: 'SPEAKER_INTRO',
  CTA_WRAP_UP: 'CTA_WRAP_UP',
} as const;

export type VideoBlockKind = (typeof VideoBlockKind)[keyof typeof VideoBlockKind];

export const VideoAnnotationFamily = {
  LOWER_THIRD: 'LOWER_THIRD',
  TITLE: 'TITLE',
  CALLOUT: 'CALLOUT',
  POINTER: 'POINTER',
  SPOTLIGHT: 'SPOTLIGHT',
  FRAME: 'FRAME',
  MARKER: 'MARKER',
} as const;

export type VideoAnnotationFamily =
  (typeof VideoAnnotationFamily)[keyof typeof VideoAnnotationFamily];

export const VideoAnnotationTargetKind = {
  NONE: 'NONE',
  POINT: 'POINT',
  RECT: 'RECT',
} as const;

export type VideoAnnotationTargetKind =
  (typeof VideoAnnotationTargetKind)[keyof typeof VideoAnnotationTargetKind];

export const VideoAnnotationRenderFamily = {
  PLATE: 'PLATE',
  LINE: 'LINE',
  FRAME: 'FRAME',
  SPOTLIGHT: 'SPOTLIGHT',
  MARKER: 'MARKER',
} as const;

export type VideoAnnotationRenderFamily =
  (typeof VideoAnnotationRenderFamily)[keyof typeof VideoAnnotationRenderFamily];

export const VideoAnnotationMotionFamily = {
  SLIDE_CARD: 'SLIDE_CARD',
  STAGGER_TITLE: 'STAGGER_TITLE',
  CONNECTOR_DRAW: 'CONNECTOR_DRAW',
  FRAME_TRACE: 'FRAME_TRACE',
  PULSE_SPOTLIGHT: 'PULSE_SPOTLIGHT',
  MARKER_POP: 'MARKER_POP',
} as const;

export type VideoAnnotationMotionFamily =
  (typeof VideoAnnotationMotionFamily)[keyof typeof VideoAnnotationMotionFamily];

export const VideoAnnotationLeaderLineStyle = {
  STRAIGHT: 'STRAIGHT',
  ELBOW: 'ELBOW',
} as const;

export type VideoAnnotationLeaderLineStyle =
  (typeof VideoAnnotationLeaderLineStyle)[keyof typeof VideoAnnotationLeaderLineStyle];

export const VideoAnnotationArrowKind = {
  NONE: 'NONE',
  CHEVRON: 'CHEVRON',
} as const;

export type VideoAnnotationArrowKind =
  (typeof VideoAnnotationArrowKind)[keyof typeof VideoAnnotationArrowKind];

export const VideoAnnotationMarkerKind = {
  NONE: 'NONE',
  DOT: 'DOT',
  RING: 'RING',
} as const;

export type VideoAnnotationMarkerKind =
  (typeof VideoAnnotationMarkerKind)[keyof typeof VideoAnnotationMarkerKind];

export const VideoAnnotationFrameKind = {
  NONE: 'NONE',
  BRACKET: 'BRACKET',
  ROUNDED_RECT: 'ROUNDED_RECT',
} as const;

export type VideoAnnotationFrameKind =
  (typeof VideoAnnotationFrameKind)[keyof typeof VideoAnnotationFrameKind];

export const VideoAnnotationPulseKind = {
  NONE: 'NONE',
  SOFT: 'SOFT',
  RING: 'RING',
} as const;

export type VideoAnnotationPulseKind =
  (typeof VideoAnnotationPulseKind)[keyof typeof VideoAnnotationPulseKind];

export const VideoOverlayAnimationKind = {
  NONE: 'NONE',
  SLIDE_UP_FADE: 'SLIDE_UP_FADE',
  SLIDE_LEFT_FADE: 'SLIDE_LEFT_FADE',
  CONNECTOR_DRAW: 'CONNECTOR_DRAW',
  ANCHOR_POP: 'ANCHOR_POP',
  REVEAL_MASK: 'REVEAL_MASK',
  SHIMMER_ENTRY: 'SHIMMER_ENTRY',
  SHIMMER_SWEEP: 'SHIMMER_SWEEP',
  SOFT_BLUR_REVEAL: 'SOFT_BLUR_REVEAL',
  SCALE_FADE: 'SCALE_FADE',
  THREE_D_REVEAL: 'THREE_D_REVEAL',
} as const;

export type VideoOverlayAnimationKind =
  (typeof VideoOverlayAnimationKind)[keyof typeof VideoOverlayAnimationKind];

export const VideoTransitionTemplateKind = {
  CROSSFADE: 'CROSSFADE',
  FADE_THROUGH_LIGHT: 'FADE_THROUGH_LIGHT',
  DIP_TO_COLOR: 'DIP_TO_COLOR',
  PUSH: 'PUSH',
  SLIDE: 'SLIDE',
  ZOOM_DISSOLVE: 'ZOOM_DISSOLVE',
  BLUR_REVEAL: 'BLUR_REVEAL',
  LIGHT_SWEEP: 'LIGHT_SWEEP',
  CARD_FLIP_REVEAL: 'CARD_FLIP_REVEAL',
  LINEAR_WIPE: 'LINEAR_WIPE',
  RADIAL_REVEAL: 'RADIAL_REVEAL',
  DISPLACEMENT_WARP: 'DISPLACEMENT_WARP',
  GLARE_SWEEP: 'GLARE_SWEEP',
} as const;

export type VideoTransitionTemplateKind =
  (typeof VideoTransitionTemplateKind)[keyof typeof VideoTransitionTemplateKind];

export const VideoTransitionRenderKind = {
  COMPOSITE: 'COMPOSITE',
  CSS_LIKE: 'CSS_LIKE',
  SHADER: 'SHADER',
} as const;

export type VideoTransitionRenderKind =
  (typeof VideoTransitionRenderKind)[keyof typeof VideoTransitionRenderKind];

export const VideoTemplateIntensity = {
  SOFT: 'SOFT',
  BALANCED: 'BALANCED',
  BOLD: 'BOLD',
} as const;

export type VideoTemplateIntensity =
  (typeof VideoTemplateIntensity)[keyof typeof VideoTemplateIntensity];

export const VideoTemplateDirection = {
  LEFT: 'LEFT',
  RIGHT: 'RIGHT',
  UP: 'UP',
  DOWN: 'DOWN',
} as const;

export type VideoTemplateDirection =
  (typeof VideoTemplateDirection)[keyof typeof VideoTemplateDirection];
