import { expect, it } from 'vitest';
import { scenarioAiOperationSchema, scenarioAiOperationsResponseSchema } from './index';

it('admits bounded text proposals addressed to stable guide items and blocks', () => {
  const response = scenarioAiOperationsResponseSchema.safeParse({
    operations: [
      { type: 'setStepTitle', stepId: 'step', title: 'Prepare the page' },
      { type: 'setHeading', stepId: 'step', blockId: 'heading', text: 'Before you start' },
      { type: 'setText', stepId: 'step', blockId: 'text', text: 'Select a region.' },
      { type: 'setNote', stepId: 'step', blockId: 'note', text: 'Keep the original.' },
      { type: 'setImageCaption', stepId: 'step', blockId: 'image', text: 'Selected region' },
      {
        type: 'setImageAlt',
        stepId: 'step',
        blockId: 'image',
        text: 'A rectangle around the menu',
      },
    ],
  });
  expect(response.success).toBe(true);
});

it('rejects legacy presentation/media operations, unknown fields and excessive proposals', () => {
  expect(
    scenarioAiOperationSchema.safeParse({ type: 'setSlideTitle', slideId: 'slide', title: 'Old' })
      .success
  ).toBe(false);
  expect(
    scenarioAiOperationSchema.safeParse({ type: 'setProjectPresentation', presentation: {} })
      .success
  ).toBe(false);
  expect(
    scenarioAiOperationSchema.safeParse({
      type: 'setText',
      stepId: 'step',
      blockId: 'text',
      text: 'Text',
      assetId: 'foreign',
    }).success
  ).toBe(false);
  expect(
    scenarioAiOperationSchema.safeParse({
      type: 'setText',
      stepId: '',
      blockId: 'text',
      text: 'Text',
    }).success
  ).toBe(false);
  expect(
    scenarioAiOperationsResponseSchema.safeParse({
      operations: Array.from({ length: 201 }, () => ({
        type: 'setStepTitle',
        stepId: 'step',
        title: '',
      })),
    }).success
  ).toBe(false);
});
