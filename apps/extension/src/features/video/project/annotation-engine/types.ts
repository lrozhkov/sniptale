import type { VideoAnnotationNodeProperty } from './node-properties';

export const VIDEO_ANNOTATION_PACK_SCHEMA_VERSION = 1;

export const VideoAnnotationElementKind = {
  INTRO: 'intro',
  LOWER_THIRD: 'lowerThird',
  TITLE: 'title',
  CALLOUT: 'callout',
  FOCUS: 'focus',
  SCENE: 'scene',
} as const;

export type VideoAnnotationElementKind =
  (typeof VideoAnnotationElementKind)[keyof typeof VideoAnnotationElementKind];

export const VideoAnnotationTargetBindingKind = {
  NONE: 'none',
  POINT: 'point',
  RECT: 'rect',
} as const;

export type VideoAnnotationTargetBindingKind =
  (typeof VideoAnnotationTargetBindingKind)[keyof typeof VideoAnnotationTargetBindingKind];

export const VideoAnnotationRenderNodeKind = {
  FRAME: 'frame',
  GROUP: 'group',
  LINE: 'line',
  MARKER: 'marker',
  MASK: 'mask',
  PATH: 'path',
  PROGRESS: 'progress',
  RECT: 'rect',
  SPOTLIGHT: 'spotlight',
  TEXT: 'text',
} as const;

export type VideoAnnotationRenderNodeKind =
  (typeof VideoAnnotationRenderNodeKind)[keyof typeof VideoAnnotationRenderNodeKind];

export const VideoAnnotationControlType = {
  BOOLEAN: 'boolean',
  COLOR: 'color',
  NUMBER: 'number',
  SELECT: 'select',
  TEXT: 'text',
} as const;

export type VideoAnnotationControlType =
  (typeof VideoAnnotationControlType)[keyof typeof VideoAnnotationControlType];

export const VideoAnnotationControlBindingKind = {
  NODE_PROPERTY: 'nodeProperty',
  TEMPLATE_FIELD: 'templateField',
  THEME_TOKEN: 'themeToken',
  TIMELINE_PROPERTY: 'timelineProperty',
} as const;

export type VideoAnnotationControlBindingKind =
  (typeof VideoAnnotationControlBindingKind)[keyof typeof VideoAnnotationControlBindingKind];

export const VideoAnnotationControlSection = {
  ADVANCED: 'advanced',
  APPEARANCE: 'appearance',
  CONTENT: 'content',
  MOTION: 'motion',
  PLACEMENT: 'placement',
} as const;

export type VideoAnnotationControlSection =
  (typeof VideoAnnotationControlSection)[keyof typeof VideoAnnotationControlSection];

export const VideoAnnotationTimelineEasing = {
  EASE_IN: 'easeIn',
  EASE_IN_OUT: 'easeInOut',
  EASE_OUT: 'easeOut',
  LINEAR: 'linear',
  SPRING: 'spring',
} as const;

export type VideoAnnotationTimelineEasing =
  (typeof VideoAnnotationTimelineEasing)[keyof typeof VideoAnnotationTimelineEasing];

export const VideoAnnotationTimelineExtrapolate = {
  CLAMP: 'clamp',
  EXTEND: 'extend',
} as const;

export type VideoAnnotationTimelineExtrapolate =
  (typeof VideoAnnotationTimelineExtrapolate)[keyof typeof VideoAnnotationTimelineExtrapolate];

export const VideoAnnotationTimelinePhase = {
  IDLE: 'idle',
  INTRO: 'intro',
  OUTRO: 'outro',
} as const;

export type VideoAnnotationTimelinePhase =
  (typeof VideoAnnotationTimelinePhase)[keyof typeof VideoAnnotationTimelinePhase];

export type VideoAnnotationPrimitiveValue = boolean | number | string | null;

export interface VideoAnnotationLocalizedText {
  fallback: string;
  key?: string | undefined;
}

export interface VideoAnnotationTemplateRef {
  packId: string;
  templateId: string;
}

export type VideoAnnotationTemplateControlValues = Record<string, VideoAnnotationPrimitiveValue>;

export interface VideoAnnotationTemplateSnapshot {
  capturedAtSchemaVersion: typeof VIDEO_ANNOTATION_PACK_SCHEMA_VERSION;
  controls: VideoAnnotationTemplateControlValues;
  packLabel?: VideoAnnotationLocalizedText | undefined;
  packTheme?: VideoAnnotationPackTheme | undefined;
  template?: VideoAnnotationTemplate | undefined;
  templateRef: VideoAnnotationTemplateRef;
}

export interface VideoAnnotationThemeToken {
  id: string;
  type: 'color' | 'fontFamily' | 'number' | 'shadow' | 'text';
  value: VideoAnnotationPrimitiveValue;
}

export interface VideoAnnotationPackTheme {
  defaults: Record<string, VideoAnnotationPrimitiveValue>;
  tokens: readonly VideoAnnotationThemeToken[];
}

export type VideoAnnotationControlBinding =
  | {
      field:
        | 'content.badge'
        | 'content.headline'
        | 'content.subline'
        | 'style.accentColor'
        | 'style.backgroundColor'
        | 'style.badgeTextColor'
        | 'style.borderRadius'
        | 'style.headlineColor'
        | 'style.padding'
        | 'style.sublineColor';
      kind: typeof VideoAnnotationControlBindingKind.TEMPLATE_FIELD;
    }
  | {
      kind: typeof VideoAnnotationControlBindingKind.THEME_TOKEN;
      tokenId: string;
    }
  | {
      kind: typeof VideoAnnotationControlBindingKind.NODE_PROPERTY;
      nodeId: string;
      property: VideoAnnotationNodeProperty;
    }
  | {
      field: 'durationMs' | 'easing';
      kind: typeof VideoAnnotationControlBindingKind.TIMELINE_PROPERTY;
      trackIds?: readonly string[] | undefined;
    };

export interface VideoAnnotationControlOption {
  label: VideoAnnotationLocalizedText;
  value: string;
}

export interface VideoAnnotationTemplateControl {
  binding: VideoAnnotationControlBinding;
  defaultValue: VideoAnnotationPrimitiveValue;
  id: string;
  label: VideoAnnotationLocalizedText;
  max?: number | undefined;
  min?: number | undefined;
  options?: readonly VideoAnnotationControlOption[] | undefined;
  section?: VideoAnnotationControlSection | undefined;
  step?: number | undefined;
  type: VideoAnnotationControlType;
}

export interface VideoAnnotationNodeFrame {
  height?: number | string | undefined;
  width?: number | string | undefined;
  x?: number | string | undefined;
  y?: number | string | undefined;
}

export interface VideoAnnotationRenderNode {
  children?: readonly VideoAnnotationRenderNode[] | undefined;
  frame?: VideoAnnotationNodeFrame | undefined;
  id: string;
  nodeType: VideoAnnotationRenderNodeKind;
  props?: Record<string, VideoAnnotationPrimitiveValue> | undefined;
  style?: Record<string, VideoAnnotationPrimitiveValue> | undefined;
}

export interface VideoAnnotationTargetBinding {
  kind: VideoAnnotationTargetBindingKind;
  required?: boolean | undefined;
}

export interface VideoAnnotationTimelineLabel {
  id: string;
  offsetMs: number;
}

export interface VideoAnnotationTimelinePhaseRange {
  durationMs: number;
  id: VideoAnnotationTimelinePhase;
  startMs: number;
}

export interface VideoAnnotationTimelineKeyframe {
  easing?: VideoAnnotationTimelineEasing | undefined;
  labelRef?: string | undefined;
  offsetMs: number;
  phase?: VideoAnnotationTimelinePhase | undefined;
  value: VideoAnnotationPrimitiveValue;
}

export interface VideoAnnotationTimelineStagger {
  index?: number | undefined;
  intervalMs: number;
}

export interface VideoAnnotationTimelineTrack {
  extrapolate?: VideoAnnotationTimelineExtrapolate | undefined;
  id: string;
  keyframes: readonly VideoAnnotationTimelineKeyframe[];
  property: string;
  stagger?: VideoAnnotationTimelineStagger | undefined;
  targetNodeId: string;
}

export interface VideoAnnotationTemplateTimeline {
  durationMs: number;
  labels: readonly VideoAnnotationTimelineLabel[];
  phases: readonly VideoAnnotationTimelinePhaseRange[];
  tracks: readonly VideoAnnotationTimelineTrack[];
}

export interface VideoAnnotationTemplate {
  controls: readonly VideoAnnotationTemplateControl[];
  description: VideoAnnotationLocalizedText;
  elementKind: VideoAnnotationElementKind;
  id: string;
  label: VideoAnnotationLocalizedText;
  renderTree: VideoAnnotationRenderNode;
  target: VideoAnnotationTargetBinding;
  timeline: VideoAnnotationTemplateTimeline;
}

export type VideoAnnotationTemplateGroups = Record<
  VideoAnnotationElementKind,
  readonly VideoAnnotationTemplate[]
>;

export interface VideoAnnotationPack {
  description: VideoAnnotationLocalizedText;
  label: VideoAnnotationLocalizedText;
  packId: string;
  schemaVersion: typeof VIDEO_ANNOTATION_PACK_SCHEMA_VERSION;
  templates: VideoAnnotationTemplateGroups;
  theme: VideoAnnotationPackTheme;
}

export interface VideoAnnotationPackValidationError {
  code: string;
  message: string;
  path: readonly (number | string)[];
}

export type VideoAnnotationPackParseResult =
  | {
      ok: true;
      pack: VideoAnnotationPack;
    }
  | {
      errors: readonly VideoAnnotationPackValidationError[];
      ok: false;
    };
