import { z } from 'zod';
import {
  scenarioAiCanvasPatchSchema,
  scenarioAiElementInputSchema,
  scenarioAiElementPatchSchema,
  scenarioAiFrameSchema,
  scenarioAiImageTransformSchema,
} from './element';
import {
  scenarioAiBackgroundTransitionSchema,
  scenarioAiElementAnimationSchema,
  scenarioAiElementBuildSchema,
  scenarioAiProjectPresentationSchema,
  scenarioAiSlideLayoutSchema,
  scenarioAiTransitionSchema,
} from './presentation';

const operationSchemas = [
  z
    .object({
      presentation: scenarioAiProjectPresentationSchema,
      type: z.literal('setProjectPresentation'),
    })
    .strict(),
  z.object({ slideId: z.string(), title: z.string(), type: z.literal('setSlideTitle') }).strict(),
  z.object({ notes: z.string(), slideId: z.string(), type: z.literal('setSlideNotes') }).strict(),
  z
    .object({
      canvasPatch: scenarioAiCanvasPatchSchema,
      slideId: z.string(),
      type: z.literal('setSlideCanvas'),
    })
    .strict(),
  z
    .object({
      layout: scenarioAiSlideLayoutSchema,
      slideId: z.string(),
      type: z.literal('setSlideLayout'),
    })
    .strict(),
  z
    .object({
      confirmed: z.boolean().optional(),
      slideId: z.string(),
      templateId: z.string(),
      type: z.literal('setSlideTemplate'),
    })
    .strict(),
  z
    .object({
      element: scenarioAiElementInputSchema,
      position: z.number().int().min(0).optional(),
      slideId: z.string(),
      type: z.literal('addElement'),
    })
    .strict(),
  z
    .object({
      elementId: z.string(),
      patch: scenarioAiElementPatchSchema,
      slideId: z.string(),
      type: z.literal('updateElement'),
    })
    .strict(),
  z
    .object({ elementId: z.string(), slideId: z.string(), type: z.literal('deleteElement') })
    .strict(),
  z
    .object({
      transition: scenarioAiTransitionSchema,
      slideId: z.string(),
      type: z.literal('setSlideTransition'),
    })
    .strict(),
  z
    .object({
      backgroundTransition: scenarioAiBackgroundTransitionSchema,
      slideId: z.string(),
      type: z.literal('setSlideBackgroundTransition'),
    })
    .strict(),
  z
    .object({
      clicks: z
        .object({
          count: z.number().int().min(0),
          initialIndex: z.number().int().min(0).optional(),
        })
        .strict(),
      slideId: z.string(),
      type: z.literal('setSlideClicks'),
    })
    .strict(),
  z
    .object({
      build: scenarioAiElementBuildSchema,
      elementId: z.string(),
      slideId: z.string(),
      type: z.literal('setElementBuild'),
    })
    .strict(),
  z
    .object({
      animation: scenarioAiElementAnimationSchema,
      elementId: z.string(),
      slideId: z.string(),
      type: z.literal('setElementAnimation'),
    })
    .strict(),
  z
    .object({
      contentTransform: scenarioAiImageTransformSchema,
      elementId: z.string(),
      slideId: z.string(),
      type: z.literal('editImageTransform'),
    })
    .strict(),
  z
    .object({
      elementId: z.string(),
      position: z.number().int().min(0),
      slideId: z.string(),
      type: z.literal('reorderElement'),
    })
    .strict(),
] as const;

export {
  scenarioAiCanvasPatchSchema,
  scenarioAiElementInputSchema,
  scenarioAiElementPatchSchema,
  scenarioAiFrameSchema,
};

export const scenarioAiOperationSchema = z.discriminatedUnion('type', operationSchemas);

export const scenarioAiOperationsResponseSchema = z
  .object({
    operations: z.array(scenarioAiOperationSchema),
  })
  .strict();

export type ScenarioAiOperation = z.infer<typeof scenarioAiOperationSchema>;
export type ScenarioAiOperationsResponse = z.infer<typeof scenarioAiOperationsResponseSchema>;
export type ScenarioAiElementInput = z.infer<typeof scenarioAiElementInputSchema>;
export type ScenarioAiElementPatch = z.infer<typeof scenarioAiElementPatchSchema>;
