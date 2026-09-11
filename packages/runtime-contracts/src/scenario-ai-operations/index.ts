import { z } from 'zod';
import { GUIDE_LIMITS } from '../scenario/types/guide';

const id = z.string().min(1).max(GUIDE_LIMITS.maxIdLength);
const text = z.string().max(GUIDE_LIMITS.maxTextLength);

/** AI proposals can edit selected text only; they cannot mutate media or publish content. */
export const scenarioAiOperationSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('setStepTitle'),
      stepId: id,
      title: z.string().max(GUIDE_LIMITS.maxLabelLength),
    })
    .strict(),
  z.object({ type: z.literal('setHeading'), stepId: id, blockId: id, text }).strict(),
  z.object({ type: z.literal('setText'), stepId: id, blockId: id, text }).strict(),
  z.object({ type: z.literal('setNote'), stepId: id, blockId: id, text }).strict(),
  z.object({ type: z.literal('setImageCaption'), stepId: id, blockId: id, text }).strict(),
  z.object({ type: z.literal('setImageAlt'), stepId: id, blockId: id, text }).strict(),
]);

/** A bounded proposal; applying it requires the originating project revision and selection. */
export const scenarioAiOperationsResponseSchema = z
  .object({
    operations: z.array(scenarioAiOperationSchema).max(200),
  })
  .strict();

export type ScenarioAiOperation = z.infer<typeof scenarioAiOperationSchema>;
export type ScenarioAiOperationsResponse = z.infer<typeof scenarioAiOperationsResponseSchema>;
