import type {
  ScenarioCaptureMetadata,
  ScenarioPageDescriptor,
  ScenarioPoint,
  ScenarioTargetDescriptor,
} from './geometry';

export const SCENARIO_SLIDE_TRANSITIONS = {
  convex: 'convex',
  fade: 'fade',
  none: 'none',
  slide: 'slide',
  zoom: 'zoom',
} as const;

export const SCENARIO_BACKGROUND_TRANSITIONS = {
  fade: 'fade',
  none: 'none',
  slide: 'slide',
  zoom: 'zoom',
} as const;

export const SCENARIO_ELEMENT_ANIMATIONS = {
  fade: 'fade',
  fadeDown: 'fade-down',
  fadeLeft: 'fade-left',
  fadeRight: 'fade-right',
  fadeUp: 'fade-up',
  none: 'none',
  scale: 'scale',
} as const;

export const SCENARIO_PRESENTATION_THEMES = {
  editorialWarm: 'editorial-warm',
  graphite: 'graphite',
  studioLight: 'studio-light',
} as const;

export const SCENARIO_SLIDE_LAYOUTS = {
  beforeAfter: 'before-after',
  blank: 'blank',
  codeFocus: 'code-focus',
  screenshotCallout: 'screenshot-callout',
  screenshotFocus: 'screenshot-focus',
  sectionDivider: 'section-divider',
  stepGuide: 'step-guide',
  summary: 'summary',
  title: 'title',
} as const;

export const SCENARIO_SLIDE_COMPOSITION_PRESETS = {
  comparison: 'comparison',
  cover: 'cover',
  divider: 'divider',
  focusFrame: 'focus-frame',
  freeform: 'freeform',
  guidedScreenshot: 'guided-screenshot',
  noteGrid: 'note-grid',
  summaryGrid: 'summary-grid',
  technicalFocus: 'technical-focus',
} as const;

export type ScenarioSlideTransitionKind =
  (typeof SCENARIO_SLIDE_TRANSITIONS)[keyof typeof SCENARIO_SLIDE_TRANSITIONS];

export type ScenarioBackgroundTransitionKind =
  (typeof SCENARIO_BACKGROUND_TRANSITIONS)[keyof typeof SCENARIO_BACKGROUND_TRANSITIONS];

export type ScenarioElementAnimationPreset =
  (typeof SCENARIO_ELEMENT_ANIMATIONS)[keyof typeof SCENARIO_ELEMENT_ANIMATIONS];

export type ScenarioPresentationThemeId =
  (typeof SCENARIO_PRESENTATION_THEMES)[keyof typeof SCENARIO_PRESENTATION_THEMES];

export type ScenarioSlideLayoutId =
  (typeof SCENARIO_SLIDE_LAYOUTS)[keyof typeof SCENARIO_SLIDE_LAYOUTS];

export type ScenarioSlideCompositionPreset =
  (typeof SCENARIO_SLIDE_COMPOSITION_PRESETS)[keyof typeof SCENARIO_SLIDE_COMPOSITION_PRESETS];

export interface ScenarioTransitionSettings {
  durationMs: number;
  easing: string;
  kind: ScenarioSlideTransitionKind;
}

export interface ScenarioBackgroundTransitionSettings {
  durationMs: number;
  easing: string;
  kind: ScenarioBackgroundTransitionKind;
}

export interface ScenarioPlayControlsSettings {
  loop: boolean;
  showControls: boolean;
  showProgress: boolean;
}

export interface ScenarioSlideGridSettings {
  columns: number;
  gutter: number;
  margin: number;
  rows: number;
}

export interface ScenarioSlideSafeArea {
  bottom: number;
  left: number;
  right: number;
  top: number;
}

export interface ScenarioSlideThemeOverrides {
  accentColor?: string;
  backgroundColor?: string;
  panelColor?: string;
  textColor?: string;
}

export interface ScenarioProjectPresentationSettings {
  backgroundTransition: ScenarioBackgroundTransitionSettings;
  controls: ScenarioPlayControlsSettings;
  defaultLayoutId: ScenarioSlideLayoutId;
  grid: ScenarioSlideGridSettings;
  themeId: ScenarioPresentationThemeId;
  transition: ScenarioTransitionSettings;
}

export interface ScenarioSlideLayoutSettings {
  compositionPreset: ScenarioSlideCompositionPreset;
  layoutId: ScenarioSlideLayoutId;
  safeArea: ScenarioSlideSafeArea;
  themeOverrides: ScenarioSlideThemeOverrides | null;
}

export interface ScenarioSlideClickSettings {
  count: number;
  initialIndex: number;
}

export interface ScenarioElementBuildSettings {
  hideAtClick: number | null;
  order: number;
  showAtClick: number;
}

export interface ScenarioElementAnimationSettings {
  durationMs: number;
  easing: string;
  preset: ScenarioElementAnimationPreset;
}

export interface ScenarioSlideGuideMetadata {
  body: string;
  stepNumber: number | null;
  targetSummary: string | null;
}

interface ScenarioCaptureSlideSource {
  assetId: string;
  captureMetadata: ScenarioCaptureMetadata;
  captureSurface: string | null;
  cursorPoint: ScenarioPoint | null;
  galleryAssetId: string | null;
  interactionPoint: ScenarioPoint | null;
  kind: 'capture';
  page: ScenarioPageDescriptor;
  sourceKind: string | null;
  target: ScenarioTargetDescriptor | null;
}

interface ScenarioManualSlideSource {
  kind: 'manual';
}

export type ScenarioSlideSource = ScenarioCaptureSlideSource | ScenarioManualSlideSource;
