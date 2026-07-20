import type { TranslationKey } from '../../platform/i18n';
import type {
  ScenarioBackgroundTransitionKind,
  ScenarioElement,
  ScenarioElementAnimationPreset,
  ScenarioPresentationThemeId,
  ScenarioSlideCompositionPreset,
  ScenarioSlideLayoutId,
  ScenarioSlideTransitionKind,
} from '@sniptale/runtime-contracts/scenario/types/v3';

export function getSlideTransitionLabelKey(kind: ScenarioSlideTransitionKind): TranslationKey {
  const keys = {
    convex: 'scenario.editor.transitionConvex',
    fade: 'scenario.editor.transitionFade',
    none: 'scenario.editor.transitionNone',
    slide: 'scenario.editor.transitionSlide',
    zoom: 'scenario.editor.transitionZoom',
  } satisfies Record<ScenarioSlideTransitionKind, TranslationKey>;

  return keys[kind];
}

export function getBackgroundTransitionLabelKey(
  kind: ScenarioBackgroundTransitionKind
): TranslationKey {
  const keys = {
    fade: 'scenario.editor.transitionFade',
    none: 'scenario.editor.transitionNone',
    slide: 'scenario.editor.transitionSlide',
    zoom: 'scenario.editor.transitionZoom',
  } satisfies Record<ScenarioBackgroundTransitionKind, TranslationKey>;

  return keys[kind];
}

export function getAnimationLabelKey(preset: ScenarioElementAnimationPreset): TranslationKey {
  const keys = {
    fade: 'scenario.editor.animationFade',
    'fade-down': 'scenario.editor.animationFadeDown',
    'fade-left': 'scenario.editor.animationFadeLeft',
    'fade-right': 'scenario.editor.animationFadeRight',
    'fade-up': 'scenario.editor.animationFadeUp',
    none: 'scenario.editor.animationNone',
    scale: 'scenario.editor.animationScale',
  } satisfies Record<ScenarioElementAnimationPreset, TranslationKey>;

  return keys[preset];
}

export function getElementKindLabelKey(kind: ScenarioElement['kind']): TranslationKey {
  const keys = {
    arrow: 'scenario.editor.arrow',
    callout: 'scenario.editor.callout',
    code: 'scenario.editor.code',
    image: 'scenario.editor.image',
    line: 'scenario.editor.line',
    shape: 'scenario.editor.shape',
    text: 'scenario.editor.text',
  } satisfies Record<ScenarioElement['kind'], TranslationKey>;

  return keys[kind];
}

export function getPresentationThemeLabelKey(themeId: ScenarioPresentationThemeId): TranslationKey {
  const keys = {
    'editorial-warm': 'scenario.editor.themeEditorialWarm',
    graphite: 'scenario.editor.themeGraphite',
    'studio-light': 'scenario.editor.themeStudioLight',
  } satisfies Record<ScenarioPresentationThemeId, TranslationKey>;

  return keys[themeId];
}

export function getSlideLayoutLabelKey(layoutId: ScenarioSlideLayoutId): TranslationKey {
  const keys = {
    'before-after': 'scenario.editor.templateBeforeAfterLabel',
    blank: 'scenario.editor.templateBlankLabel',
    'code-focus': 'scenario.editor.templateCodeFocusLabel',
    'screenshot-callout': 'scenario.editor.templateScreenshotCalloutLabel',
    'screenshot-focus': 'scenario.editor.templateScreenshotFocusLabel',
    'section-divider': 'scenario.editor.templateSectionDividerLabel',
    'step-guide': 'scenario.editor.templateStepGuideLabel',
    summary: 'scenario.editor.templateSummaryLabel',
    title: 'scenario.editor.templateTitleLabel',
  } satisfies Record<ScenarioSlideLayoutId, TranslationKey>;

  return keys[layoutId];
}

export function getCompositionPresetLabelKey(
  preset: ScenarioSlideCompositionPreset
): TranslationKey {
  const keys = {
    comparison: 'scenario.editor.compositionComparison',
    cover: 'scenario.editor.compositionCover',
    divider: 'scenario.editor.compositionDivider',
    'focus-frame': 'scenario.editor.compositionFocusFrame',
    freeform: 'scenario.editor.compositionFreeform',
    'guided-screenshot': 'scenario.editor.compositionGuidedScreenshot',
    'note-grid': 'scenario.editor.compositionNoteGrid',
    'summary-grid': 'scenario.editor.compositionSummaryGrid',
    'technical-focus': 'scenario.editor.compositionTechnicalFocus',
  } satisfies Record<ScenarioSlideCompositionPreset, TranslationKey>;

  return keys[preset];
}
