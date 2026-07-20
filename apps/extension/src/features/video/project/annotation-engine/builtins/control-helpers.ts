import {
  VideoAnnotationControlBindingKind,
  VideoAnnotationControlSection,
  VideoAnnotationControlType,
  VideoAnnotationTimelineEasing,
  type VideoAnnotationLocalizedText,
  type VideoAnnotationTemplateControl,
} from '../types';

const ANNOTATION_TEMPLATE_KEY_PREFIX = 'videoEditor.sidebar.annotationTemplates';

function controlLabel(key: string, fallback: string): VideoAnnotationLocalizedText {
  return { fallback, key: `${ANNOTATION_TEMPLATE_KEY_PREFIX}.controls.${key}` };
}

export function createContentControls(defaults: {
  accent: string;
  badge?: string | null;
  background: string;
  durationMs: number;
  easing: VideoAnnotationTimelineEasing;
  headline: string;
  headlineColor: string;
  radius: number;
  subline: string;
  sublineColor: string;
}): readonly VideoAnnotationTemplateControl[] {
  return [
    ...createTemplateContentControls(defaults),
    ...createTemplateAppearanceControls(defaults),
    ...createTemplateMotionControls(defaults),
  ];
}

function createTemplateContentControls(defaults: {
  badge?: string | null;
  headline: string;
  subline: string;
}): readonly VideoAnnotationTemplateControl[] {
  return [
    {
      binding: {
        field: 'content.headline',
        kind: VideoAnnotationControlBindingKind.TEMPLATE_FIELD,
      },
      defaultValue: defaults.headline,
      id: 'headline',
      label: { fallback: 'Headline', key: 'videoEditor.sidebar.annotationHeadlineLabel' },
      section: VideoAnnotationControlSection.CONTENT,
      type: VideoAnnotationControlType.TEXT,
    },
    {
      binding: {
        field: 'content.subline',
        kind: VideoAnnotationControlBindingKind.TEMPLATE_FIELD,
      },
      defaultValue: defaults.subline,
      id: 'subline',
      label: { fallback: 'Subline', key: 'videoEditor.sidebar.annotationSublineLabel' },
      section: VideoAnnotationControlSection.CONTENT,
      type: VideoAnnotationControlType.TEXT,
    },
    {
      binding: {
        field: 'content.badge',
        kind: VideoAnnotationControlBindingKind.TEMPLATE_FIELD,
      },
      defaultValue: defaults.badge ?? null,
      id: 'badge',
      label: { fallback: 'Badge', key: 'videoEditor.sidebar.annotationBadgeLabel' },
      section: VideoAnnotationControlSection.CONTENT,
      type: VideoAnnotationControlType.TEXT,
    },
  ];
}

function createTemplateAppearanceControls(defaults: {
  accent: string;
  background: string;
  headlineColor: string;
  radius: number;
  sublineColor: string;
}): readonly VideoAnnotationTemplateControl[] {
  return [
    {
      binding: { kind: VideoAnnotationControlBindingKind.THEME_TOKEN, tokenId: 'accent' },
      defaultValue: defaults.accent,
      id: 'accent',
      label: { fallback: 'Accent', key: 'videoEditor.sidebar.annotationAccentColorLabel' },
      section: VideoAnnotationControlSection.APPEARANCE,
      type: VideoAnnotationControlType.COLOR,
    },
    {
      binding: { kind: VideoAnnotationControlBindingKind.THEME_TOKEN, tokenId: 'panel' },
      defaultValue: defaults.background,
      id: 'surface',
      label: { fallback: 'Surface', key: 'videoEditor.sidebar.annotationBackgroundColorLabel' },
      section: VideoAnnotationControlSection.APPEARANCE,
      type: VideoAnnotationControlType.COLOR,
    },
    {
      binding: { kind: VideoAnnotationControlBindingKind.THEME_TOKEN, tokenId: 'text' },
      defaultValue: defaults.headlineColor,
      id: 'headlineColor',
      label: {
        fallback: 'Headline color',
        key: 'videoEditor.sidebar.annotationHeadlineColorLabel',
      },
      section: VideoAnnotationControlSection.APPEARANCE,
      type: VideoAnnotationControlType.COLOR,
    },
    {
      binding: { kind: VideoAnnotationControlBindingKind.THEME_TOKEN, tokenId: 'mutedText' },
      defaultValue: defaults.sublineColor,
      id: 'sublineColor',
      label: { fallback: 'Subline color', key: 'videoEditor.sidebar.annotationSublineColorLabel' },
      section: VideoAnnotationControlSection.APPEARANCE,
      type: VideoAnnotationControlType.COLOR,
    },
    ...createTemplateAppearanceLayoutControls(defaults),
  ];
}

function createTemplateAppearanceLayoutControls(defaults: {
  radius: number;
}): readonly VideoAnnotationTemplateControl[] {
  return [
    {
      binding: {
        kind: VideoAnnotationControlBindingKind.NODE_PROPERTY,
        nodeId: 'panel',
        property: 'radius',
      },
      defaultValue: defaults.radius,
      id: 'radius',
      label: { fallback: 'Corner radius', key: 'videoEditor.sidebar.annotationBorderRadiusLabel' },
      max: 36,
      min: 0,
      section: VideoAnnotationControlSection.APPEARANCE,
      step: 1,
      type: VideoAnnotationControlType.NUMBER,
    },
  ];
}

function createTemplateMotionControls(defaults: {
  durationMs: number;
  easing: VideoAnnotationTimelineEasing;
}): readonly VideoAnnotationTemplateControl[] {
  return [
    {
      binding: { field: 'durationMs', kind: VideoAnnotationControlBindingKind.TIMELINE_PROPERTY },
      defaultValue: defaults.durationMs,
      id: 'durationMs',
      label: controlLabel('durationMs', 'Motion duration'),
      max: 5000,
      min: 400,
      section: VideoAnnotationControlSection.MOTION,
      step: 100,
      type: VideoAnnotationControlType.NUMBER,
    },
    {
      binding: { field: 'easing', kind: VideoAnnotationControlBindingKind.TIMELINE_PROPERTY },
      defaultValue: defaults.easing,
      id: 'easing',
      label: controlLabel('easing', 'Motion easing'),
      options: [
        {
          label: controlLabel('easeOut', 'Ease out'),
          value: VideoAnnotationTimelineEasing.EASE_OUT,
        },
        {
          label: controlLabel('easeInOut', 'Ease in out'),
          value: VideoAnnotationTimelineEasing.EASE_IN_OUT,
        },
        { label: controlLabel('linear', 'Linear'), value: VideoAnnotationTimelineEasing.LINEAR },
        { label: controlLabel('spring', 'Spring'), value: VideoAnnotationTimelineEasing.SPRING },
      ],
      section: VideoAnnotationControlSection.MOTION,
      type: VideoAnnotationControlType.SELECT,
    },
  ];
}
