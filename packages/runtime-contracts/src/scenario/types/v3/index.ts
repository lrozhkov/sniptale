export type {
  ScenarioAssetRef,
  ScenarioCanvasBackground,
  ScenarioCaptureMetadata,
  ScenarioElementFrame,
  ScenarioPageDescriptor,
  ScenarioPoint,
  ScenarioRect,
  ScenarioSlideCanvas,
  ScenarioTargetDescriptor,
} from './geometry';
export type { ScenarioProjectV3 } from './project';
export {
  SCENARIO_BACKGROUND_TRANSITIONS,
  SCENARIO_ELEMENT_ANIMATIONS,
  SCENARIO_PRESENTATION_THEMES,
  SCENARIO_SLIDE_COMPOSITION_PRESETS,
  SCENARIO_SLIDE_LAYOUTS,
  SCENARIO_SLIDE_TRANSITIONS,
} from './presentation';
export type {
  ScenarioBackgroundTransitionKind,
  ScenarioBackgroundTransitionSettings,
  ScenarioElementAnimationPreset,
  ScenarioElementAnimationSettings,
  ScenarioElementBuildSettings,
  ScenarioPlayControlsSettings,
  ScenarioPresentationThemeId,
  ScenarioProjectPresentationSettings,
  ScenarioSlideCompositionPreset,
  ScenarioSlideClickSettings,
  ScenarioSlideGridSettings,
  ScenarioSlideGuideMetadata,
  ScenarioSlideLayoutId,
  ScenarioSlideLayoutSettings,
  ScenarioSlideSafeArea,
  ScenarioSlideSource,
  ScenarioSlideThemeOverrides,
  ScenarioSlideTransitionKind,
  ScenarioTransitionSettings,
} from './presentation';
export type { ScenarioSlide, ScenarioTrashedSlide } from './slide';
export type {
  ScenarioImportedTemplateLibrary,
  ScenarioTemplateCatalogStatus,
  ScenarioTemplateDefinition,
  ScenarioTemplateLibraryRef,
  ScenarioTemplateSlideDefinition,
} from './template';
export { SCENARIO_TEMPLATE_CATALOG_STATUS } from './template';
export * from './elements';
