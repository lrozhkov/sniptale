import { z } from 'zod';
import {
  SCENARIO_BACKGROUND_TRANSITIONS,
  SCENARIO_ELEMENT_ANIMATIONS,
  SCENARIO_PRESENTATION_THEMES,
  SCENARIO_SLIDE_COMPOSITION_PRESETS,
  SCENARIO_SLIDE_LAYOUTS,
  SCENARIO_SLIDE_TRANSITIONS,
  type ScenarioBackgroundTransitionKind,
  type ScenarioElementAnimationPreset,
  type ScenarioPresentationThemeId,
  type ScenarioSlideCompositionPreset,
  type ScenarioSlideLayoutId,
  type ScenarioSlideTransitionKind,
} from '../scenario/types/v3';

export const finiteNumberSchema = z.number().finite();

const slideTransitionValues = Object.values(SCENARIO_SLIDE_TRANSITIONS) as [
  ScenarioSlideTransitionKind,
  ...ScenarioSlideTransitionKind[],
];
const backgroundTransitionValues = Object.values(SCENARIO_BACKGROUND_TRANSITIONS) as [
  ScenarioBackgroundTransitionKind,
  ...ScenarioBackgroundTransitionKind[],
];
const elementAnimationValues = Object.values(SCENARIO_ELEMENT_ANIMATIONS) as [
  ScenarioElementAnimationPreset,
  ...ScenarioElementAnimationPreset[],
];
const themeValues = Object.values(SCENARIO_PRESENTATION_THEMES) as [
  ScenarioPresentationThemeId,
  ...ScenarioPresentationThemeId[],
];
const layoutValues = Object.values(SCENARIO_SLIDE_LAYOUTS) as [
  ScenarioSlideLayoutId,
  ...ScenarioSlideLayoutId[],
];
const compositionPresetValues = Object.values(SCENARIO_SLIDE_COMPOSITION_PRESETS) as [
  ScenarioSlideCompositionPreset,
  ...ScenarioSlideCompositionPreset[],
];

export const scenarioAiTransitionSchema = z
  .object({
    durationMs: finiteNumberSchema.min(0),
    easing: z.string(),
    kind: z.enum(slideTransitionValues),
  })
  .strict();

export const scenarioAiBackgroundTransitionSchema = z
  .object({
    durationMs: finiteNumberSchema.min(0),
    easing: z.string(),
    kind: z.enum(backgroundTransitionValues),
  })
  .strict();

export const scenarioAiElementBuildSchema = z
  .object({
    hideAtClick: z.number().int().min(0).nullable().optional(),
    order: z.number().int().min(0).optional(),
    showAtClick: z.number().int().min(0).optional(),
  })
  .strict();

export const scenarioAiElementAnimationSchema = z
  .object({
    durationMs: finiteNumberSchema.min(0).optional(),
    easing: z.string().optional(),
    preset: z.enum(elementAnimationValues).optional(),
  })
  .strict();

export const scenarioAiProjectPresentationSchema = z
  .object({
    backgroundTransition: scenarioAiBackgroundTransitionSchema.optional(),
    controls: z
      .object({
        loop: z.boolean().optional(),
        showControls: z.boolean().optional(),
        showProgress: z.boolean().optional(),
      })
      .strict()
      .optional(),
    defaultLayoutId: z.enum(layoutValues).optional(),
    grid: z
      .object({
        columns: z.number().int().positive().optional(),
        gutter: finiteNumberSchema.min(0).optional(),
        margin: finiteNumberSchema.min(0).optional(),
        rows: z.number().int().positive().optional(),
      })
      .strict()
      .optional(),
    themeId: z.enum(themeValues).optional(),
    transition: scenarioAiTransitionSchema.optional(),
  })
  .strict();

export const scenarioAiSlideLayoutSchema = z
  .object({
    compositionPreset: z.enum(compositionPresetValues).optional(),
    layoutId: z.enum(layoutValues).optional(),
    safeArea: z
      .object({
        bottom: finiteNumberSchema.min(0).optional(),
        left: finiteNumberSchema.min(0).optional(),
        right: finiteNumberSchema.min(0).optional(),
        top: finiteNumberSchema.min(0).optional(),
      })
      .strict()
      .optional(),
    themeOverrides: z
      .object({
        accentColor: z.string().optional(),
        backgroundColor: z.string().optional(),
        panelColor: z.string().optional(),
        textColor: z.string().optional(),
      })
      .strict()
      .nullable()
      .optional(),
  })
  .strict();
