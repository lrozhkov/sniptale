import { expect, it } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import {
  processScenarioEditorWithLlmMessageSchema,
  processScenarioEditorWithLlmResponseSchema,
} from './ai-schemas';
import { parseRuntimeResponseForMessage } from '../parsers/boundary';

function createScenarioAiMessage(overrides: Record<string, unknown> = {}) {
  return {
    attachments: [],
    contractVersion: 4 as const,
    projectId: 'project-1',
    baseRevision: 1,
    scope: { stepIds: ['step-1'], blockIds: [] },
    instruction: 'Update the selected slide',
    llmSessionToken: 'llm-session-token-1',
    projectSnapshotJson: '{"steps":[]}',
    type: MessageType.PROCESS_SCENARIO_EDITOR_WITH_LLM,
    ...overrides,
  };
}

it('accepts guide editor operation request and response payloads', () => {
  expect(
    processScenarioEditorWithLlmMessageSchema.parse(
      createScenarioAiMessage({
        contractVersion: 4 as const,
        projectId: 'project-1',
        baseRevision: 1,
        scope: { stepIds: ['step-1'], blockIds: [] },
        projectOutlineJson: '{"slides":[]}',
        projectSnapshotJson: '{"outline":{"version":3}}',
        selectedStepJson: '{"id":"slide-1"}',
        toolManifestJson: '{"operations":["setStepTitle"]}',
      })
    )
  ).toMatchObject({ contractVersion: 4 });

  expect(
    processScenarioEditorWithLlmResponseSchema.parse({
      operations: [{ stepId: 'slide-1', title: 'AI title', type: 'setStepTitle' }],
      success: true,
    })
  ).toMatchObject({
    operations: [{ stepId: 'slide-1', title: 'AI title', type: 'setStepTitle' }],
  });
});

it('accepts bounded guide editor request payloads', () => {
  expect(processScenarioEditorWithLlmMessageSchema.parse(createScenarioAiMessage())).toMatchObject({
    contractVersion: 4 as const,
    projectId: 'project-1',
    baseRevision: 1,
    scope: { stepIds: ['step-1'], blockIds: [] },
    projectSnapshotJson: '{"steps":[]}',
  });
  expect(
    processScenarioEditorWithLlmMessageSchema.parse(
      createScenarioAiMessage({
        contractVersion: 4 as const,
        projectId: 'project-1',
        baseRevision: 1,
        scope: { stepIds: ['step-1'], blockIds: [] },
        projectOutlineJson: '{"slides":[]}',
        selectedStepJson: '{"id":"slide-1"}',
        toolManifestJson: '{"operations":["setStepTitle"]}',
      })
    )
  ).toMatchObject({ contractVersion: 4 });
});

it('rejects missing or v2 scenario editor contract versions', () => {
  expect(() =>
    processScenarioEditorWithLlmMessageSchema.parse(
      createScenarioAiMessage({ contractVersion: undefined })
    )
  ).toThrow();
  expect(() =>
    processScenarioEditorWithLlmMessageSchema.parse(createScenarioAiMessage({ contractVersion: 2 }))
  ).toThrow();
});

it('rejects unknown scenario editor AI request and response fields', () => {
  expect(() =>
    processScenarioEditorWithLlmMessageSchema.parse(createScenarioAiMessage({ extra: true }))
  ).toThrow();
  expect(() =>
    parseRuntimeResponseForMessage(MessageType.PROCESS_SCENARIO_EDITOR_WITH_LLM, {
      cleanedResponse: '{"token":"secret"}',
      parseError: 'invalid-json',
      rawResponse: 'page text token=secret',
      success: false,
    })
  ).toThrow();
});

it('rejects unbounded scenario editor parse error details', () => {
  expect(() =>
    parseRuntimeResponseForMessage(MessageType.PROCESS_SCENARIO_EDITOR_WITH_LLM, {
      parseError: 'token=secret page text',
      success: false,
    })
  ).toThrow();
});

it('rejects oversized scenario editor AI request text fields', () => {
  expect(() =>
    processScenarioEditorWithLlmMessageSchema.parse(
      createScenarioAiMessage({ instruction: 'x'.repeat(16_001) })
    )
  ).toThrow();
  expect(() =>
    processScenarioEditorWithLlmMessageSchema.parse(
      createScenarioAiMessage({ projectSnapshotJson: 'x'.repeat(2_000_001) })
    )
  ).toThrow();
  expect(() =>
    processScenarioEditorWithLlmMessageSchema.parse(
      createScenarioAiMessage({ selectedStepJson: 'x'.repeat(1_000_001) })
    )
  ).toThrow();
});

it('rejects unsafe or oversized scenario editor AI attachments', () => {
  const validAttachment = {
    dataUrl: 'data:image/png;base64,AA==',
    filename: 'shot.png',
    mimeType: 'image/png',
    stepId: 'step-1',
    stepNumber: 1,
  };

  expect(() =>
    processScenarioEditorWithLlmMessageSchema.parse(
      createScenarioAiMessage({
        attachments: [{ ...validAttachment, mimeType: 'image/svg+xml' }],
      })
    )
  ).toThrow();
  expect(() =>
    processScenarioEditorWithLlmMessageSchema.parse(
      createScenarioAiMessage({
        attachments: [
          {
            ...validAttachment,
            dataUrl: `data:image/png;base64,${'a'.repeat(10_000_001)}`,
          },
        ],
      })
    )
  ).toThrow();
  expect(() =>
    processScenarioEditorWithLlmMessageSchema.parse(
      createScenarioAiMessage({
        attachments: Array.from({ length: 21 }, (_, index) => ({
          ...validAttachment,
          stepId: `step-${index + 1}`,
          stepNumber: index + 1,
        })),
      })
    )
  ).toThrow();
});

it('admits empty document scope and rejects block/document scope combinations', () => {
  expect(
    processScenarioEditorWithLlmMessageSchema.safeParse(
      createScenarioAiMessage({ scope: { stepIds: [], blockIds: [], document: true } })
    ).success
  ).toBe(true);
  expect(
    processScenarioEditorWithLlmMessageSchema.safeParse(
      createScenarioAiMessage({ scope: { stepIds: [], blockIds: [] } })
    ).success
  ).toBe(false);
  expect(
    processScenarioEditorWithLlmMessageSchema.safeParse(
      createScenarioAiMessage({ scope: { stepIds: ['step'], blockIds: ['block'], document: true } })
    ).success
  ).toBe(false);
});
