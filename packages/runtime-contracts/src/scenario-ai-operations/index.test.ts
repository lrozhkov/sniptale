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

it('generates the advertised contract from the accepted presentation schemas', async () => {
  const {
    createScenarioAiManifest,
    buildScenarioAiSystemPrompt,
    scenarioAiOperationsResponseSchema,
  } = await import('./index');
  const { z } = await import('zod');
  const manifest = createScenarioAiManifest();
  expect(manifest.response).toEqual(
    z.toJSONSchema(scenarioAiOperationsResponseSchema, { reused: 'ref' })
  );
  const prompt = buildScenarioAiSystemPrompt('User writing style');
  expect(prompt).toContain('User writing style');
  expect(prompt).toContain('setBlockParameters');
  expect(prompt).toContain('contentTransform');
  expect(prompt).not.toContain('annotationsMode');
  expect(prompt.length).toBeLessThan(18000);
  expect(
    scenarioAiOperationsResponseSchema.parse({
      operations: [
        { type: 'setStepParameters', stepId: 'step', parameters: { layout: 'comparison' } },
        {
          type: 'setBlockParameters',
          stepId: 'step',
          blockId: 'image',
          parameters: { width: 33, fit: 'cover' },
        },
      ],
    }).operations
  ).toHaveLength(2);
});

it('exposes prose minimum height to AI through the same bounded contract', async () => {
  const { buildScenarioAiSystemPrompt } = await import('./index');
  expect(buildScenarioAiSystemPrompt('Improve the guide')).toContain('minHeight');
  for (const minHeight of [0, 240, 7680]) {
    expect(
      scenarioAiOperationSchema.safeParse({
        type: 'setBlockParameters',
        stepId: 'step',
        blockId: 'block',
        parameters: { minHeight },
      }).success
    ).toBe(true);
    expect(
      scenarioAiOperationSchema.safeParse({
        type: 'setBlockParameters',
        stepId: 'step',
        blockId: 'block',
        parameters: { minHeight: -10 },
      }).success
    ).toBe(false);
  }
});

it('exposes local row boundaries to AI without a second parameter registry', async () => {
  const { buildScenarioAiSystemPrompt } = await import('./index');
  expect(buildScenarioAiSystemPrompt('Improve')).toContain('rowStart=true');
  for (const rowStart of [true, false]) {
    expect(
      scenarioAiOperationSchema.safeParse({
        type: 'setBlockParameters',
        stepId: 'step',
        blockId: 'block',
        parameters: { rowStart },
      }).success
    ).toBe(true);
  }
  expect(
    scenarioAiOperationSchema.safeParse({
      type: 'setBlockParameters',
      stepId: 'step',
      blockId: 'block',
      parameters: { rowStart: 'yes' },
    }).success
  ).toBe(false);
});
