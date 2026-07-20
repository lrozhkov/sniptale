import { z } from 'zod';
import { SCENARIO_V3_ELEMENT_KINDS } from '../scenario/types/v3';
import {
  finiteNumberSchema,
  scenarioAiElementAnimationSchema,
  scenarioAiElementBuildSchema,
} from './presentation';

export const scenarioAiFrameSchema = z
  .object({
    height: finiteNumberSchema.positive(),
    width: finiteNumberSchema.positive(),
    x: finiteNumberSchema,
    y: finiteNumberSchema,
  })
  .strict();

const pointSchema = z.object({ x: finiteNumberSchema, y: finiteNumberSchema }).strict();
const canvasBackgroundSchema = z.discriminatedUnion('kind', [
  z.object({ color: z.string(), kind: z.literal('solid') }).strict(),
  z.object({ kind: z.literal('transparent') }).strict(),
]);

export const scenarioAiCanvasPatchSchema = z
  .object({
    background: canvasBackgroundSchema.optional(),
    height: finiteNumberSchema.min(240).optional(),
    width: finiteNumberSchema.min(320).optional(),
  })
  .strict();

const baseElementInputSchema = z.object({
  animation: scenarioAiElementAnimationSchema.optional(),
  build: scenarioAiElementBuildSchema.optional(),
  frame: scenarioAiFrameSchema,
  locked: z.boolean().optional(),
  name: z.string().optional(),
  opacity: z.number().min(0).max(1).optional(),
  role: z.string().nullable().optional(),
  visible: z.boolean().optional(),
});

const textStyleSchema = z
  .object({
    align: z.enum(['center', 'left', 'right']).optional(),
    color: z.string().optional(),
    fontSize: finiteNumberSchema.positive().optional(),
    fontWeight: finiteNumberSchema.positive().optional(),
  })
  .strict();

const codeStyleSchema = z
  .object({
    backgroundColor: z.string().optional(),
    fontSize: finiteNumberSchema.positive().optional(),
    textColor: z.string().optional(),
  })
  .strict();

const panelSchema = z
  .object({
    backgroundColor: z.string().optional(),
    borderColor: z.string().optional(),
    borderWidth: finiteNumberSchema.min(0).optional(),
    textColor: z.string().optional(),
  })
  .strict();

const lineElementInputShape = {
  dash: z.enum(['dashed', 'dotted', 'solid']).optional(),
  end: pointSchema.optional(),
  start: pointSchema.optional(),
  strokeColor: z.string().optional(),
  strokeWidth: finiteNumberSchema.min(0).optional(),
};

export const scenarioAiElementInputSchema = z.discriminatedUnion('kind', [
  baseElementInputSchema
    .extend({
      kind: z.literal(SCENARIO_V3_ELEMENT_KINDS.text),
      style: textStyleSchema.optional(),
      text: z.string().optional(),
    })
    .strict(),
  baseElementInputSchema
    .extend({
      assetRef: z.object({ assetId: z.string(), galleryAssetId: z.string().nullable() }).optional(),
      fit: z.enum(['contain', 'cover', 'fill', 'original']).optional(),
      kind: z.literal(SCENARIO_V3_ELEMENT_KINDS.image),
    })
    .strict(),
  baseElementInputSchema
    .extend({
      cornerRadius: finiteNumberSchema.min(0).optional(),
      fillColor: z.string().optional(),
      kind: z.literal(SCENARIO_V3_ELEMENT_KINDS.shape),
      shape: z.enum(['ellipse', 'rect']).optional(),
      strokeColor: z.string().optional(),
      strokeWidth: finiteNumberSchema.min(0).optional(),
    })
    .strict(),
  baseElementInputSchema
    .extend({
      ...lineElementInputShape,
      kind: z.literal(SCENARIO_V3_ELEMENT_KINDS.line),
    })
    .strict(),
  baseElementInputSchema
    .extend({
      ...lineElementInputShape,
      head: z.enum(['both', 'end', 'start']).optional(),
      kind: z.literal(SCENARIO_V3_ELEMENT_KINDS.arrow),
    })
    .strict(),
  baseElementInputSchema
    .extend({
      connector: z.object({ end: pointSchema, start: pointSchema }).nullable().optional(),
      kind: z.literal(SCENARIO_V3_ELEMENT_KINDS.callout),
      panel: panelSchema.optional(),
      text: z.string().optional(),
    })
    .strict(),
  baseElementInputSchema
    .extend({
      code: z.string().optional(),
      kind: z.literal(SCENARIO_V3_ELEMENT_KINDS.code),
      language: z.string().optional(),
      style: codeStyleSchema.optional(),
    })
    .strict(),
]);

export const scenarioAiElementPatchSchema = z
  .object({
    animation: scenarioAiElementAnimationSchema.optional(),
    build: scenarioAiElementBuildSchema.optional(),
    code: z.string().optional(),
    connector: z.object({ end: pointSchema, start: pointSchema }).nullable().optional(),
    contentTransform: z
      .object({
        scale: finiteNumberSchema.positive().optional(),
        x: finiteNumberSchema.optional(),
        y: finiteNumberSchema.optional(),
      })
      .strict()
      .optional(),
    cornerRadius: finiteNumberSchema.min(0).optional(),
    dash: z.enum(['dashed', 'dotted', 'solid']).optional(),
    end: pointSchema.optional(),
    fillColor: z.string().optional(),
    fit: z.enum(['contain', 'cover', 'fill', 'original']).optional(),
    frame: scenarioAiFrameSchema.partial().strict().optional(),
    head: z.enum(['both', 'end', 'start']).optional(),
    language: z.string().optional(),
    locked: z.boolean().optional(),
    name: z.string().optional(),
    opacity: z.number().min(0).max(1).optional(),
    panel: panelSchema.optional(),
    shape: z.enum(['ellipse', 'rect']).optional(),
    start: pointSchema.optional(),
    strokeColor: z.string().optional(),
    strokeWidth: finiteNumberSchema.min(0).optional(),
    style: z.union([textStyleSchema, codeStyleSchema]).optional(),
    text: z.string().optional(),
    visible: z.boolean().optional(),
  })
  .strict();

export const scenarioAiImageTransformSchema = z
  .object({
    scale: finiteNumberSchema.positive().optional(),
    x: finiteNumberSchema.optional(),
    y: finiteNumberSchema.optional(),
  })
  .strict();
