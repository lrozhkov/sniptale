import type {
  ScenarioBackgroundTransitionSettings,
  ScenarioElementAnimationSettings,
  ScenarioElementBuildSettings,
  ScenarioProjectPresentationSettings,
  ScenarioSlideGridSettings,
  ScenarioSlideClickSettings,
  ScenarioSlideGuideMetadata,
  ScenarioSlideLayoutSettings,
  ScenarioSlideSafeArea,
  ScenarioSlideSource,
  ScenarioTransitionSettings,
} from '@sniptale/runtime-contracts/scenario/types/v3';

export function createDefaultScenarioTransition(
  overrides: Partial<ScenarioTransitionSettings> = {}
): ScenarioTransitionSettings {
  return {
    durationMs: overrides.durationMs ?? 420,
    easing: overrides.easing ?? 'ease',
    kind: overrides.kind ?? 'fade',
  };
}

export function createDefaultScenarioBackgroundTransition(
  overrides: Partial<ScenarioBackgroundTransitionSettings> = {}
): ScenarioBackgroundTransitionSettings {
  return {
    durationMs: overrides.durationMs ?? 420,
    easing: overrides.easing ?? 'ease',
    kind: overrides.kind ?? 'fade',
  };
}

export function createDefaultScenarioProjectPresentation(
  overrides: Partial<ScenarioProjectPresentationSettings> = {}
): ScenarioProjectPresentationSettings {
  return {
    backgroundTransition: createDefaultScenarioBackgroundTransition(overrides.backgroundTransition),
    controls: {
      loop: overrides.controls?.loop ?? false,
      showControls: overrides.controls?.showControls ?? true,
      showProgress: overrides.controls?.showProgress ?? true,
    },
    defaultLayoutId: overrides.defaultLayoutId ?? 'blank',
    grid: createDefaultScenarioSlideGrid(overrides.grid),
    themeId: overrides.themeId ?? 'editorial-warm',
    transition: createDefaultScenarioTransition(overrides.transition),
  };
}

export function createDefaultScenarioSlideGrid(
  overrides: Partial<ScenarioSlideGridSettings> = {}
): ScenarioSlideGridSettings {
  return {
    columns: Math.max(1, Math.trunc(overrides.columns ?? 12)),
    gutter: Math.max(0, overrides.gutter ?? 24),
    margin: Math.max(0, overrides.margin ?? 64),
    rows: Math.max(1, Math.trunc(overrides.rows ?? 8)),
  };
}

export function createDefaultScenarioSlideSafeArea(
  overrides: Partial<ScenarioSlideSafeArea> = {}
): ScenarioSlideSafeArea {
  return {
    bottom: Math.max(0, overrides.bottom ?? 56),
    left: Math.max(0, overrides.left ?? 64),
    right: Math.max(0, overrides.right ?? 64),
    top: Math.max(0, overrides.top ?? 56),
  };
}

export function createDefaultScenarioSlideLayout(
  overrides: Partial<ScenarioSlideLayoutSettings> = {}
): ScenarioSlideLayoutSettings {
  return {
    compositionPreset: overrides.compositionPreset ?? 'freeform',
    layoutId: overrides.layoutId ?? 'blank',
    safeArea: createDefaultScenarioSlideSafeArea(overrides.safeArea),
    themeOverrides: overrides.themeOverrides ?? null,
  };
}

export function createDefaultScenarioSlideClicks(
  overrides: Partial<ScenarioSlideClickSettings> = {}
): ScenarioSlideClickSettings {
  return {
    count: Math.max(0, Math.trunc(overrides.count ?? 0)),
    initialIndex: Math.max(0, Math.trunc(overrides.initialIndex ?? 0)),
  };
}

export function createDefaultScenarioElementBuild(
  overrides: Partial<ScenarioElementBuildSettings> = {}
): ScenarioElementBuildSettings {
  return {
    hideAtClick: overrides.hideAtClick ?? null,
    order: Math.max(0, Math.trunc(overrides.order ?? 0)),
    showAtClick: Math.max(0, Math.trunc(overrides.showAtClick ?? 0)),
  };
}

export function createDefaultScenarioElementAnimation(
  overrides: Partial<ScenarioElementAnimationSettings> = {}
): ScenarioElementAnimationSettings {
  return {
    durationMs: overrides.durationMs ?? 240,
    easing: overrides.easing ?? 'ease',
    preset: overrides.preset ?? 'none',
  };
}

export function createManualScenarioSlideSource(): ScenarioSlideSource {
  return { kind: 'manual' };
}

export function createDefaultScenarioSlideGuide(
  overrides: Partial<ScenarioSlideGuideMetadata> = {}
): ScenarioSlideGuideMetadata {
  return {
    body: overrides.body ?? '',
    stepNumber: overrides.stepNumber ?? null,
    targetSummary: overrides.targetSummary ?? null,
  };
}
