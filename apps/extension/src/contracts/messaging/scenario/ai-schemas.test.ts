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
    contractVersion: 3,
    instruction: 'Update the selected slide',
    llmSessionToken: 'llm-session-token-1',
    projectSnapshotJson: '{"steps":[]}',
    type: MessageType.PROCESS_SCENARIO_EDITOR_WITH_LLM,
    ...overrides,
  };
}

it('accepts v3 scenario editor operation request and response payloads', () => {
  expect(
    processScenarioEditorWithLlmMessageSchema.parse(
      createScenarioAiMessage({
        contractVersion: 3,
        projectOutlineJson: '{"slides":[]}',
        projectSnapshotJson: '{"outline":{"version":3}}',
        selectedSlideCodeJson: '{"id":"slide-1"}',
        toolManifestJson: '{"operations":["setSlideTitle"]}',
      })
    )
  ).toMatchObject({ contractVersion: 3 });

  expect(
    processScenarioEditorWithLlmResponseSchema.parse({
      operations: [{ slideId: 'slide-1', title: 'AI title', type: 'setSlideTitle' }],
      success: true,
    })
  ).toMatchObject({
    operations: [{ slideId: 'slide-1', title: 'AI title', type: 'setSlideTitle' }],
  });
});

it('accepts bounded v3 scenario editor request payloads', () => {
  expect(processScenarioEditorWithLlmMessageSchema.parse(createScenarioAiMessage())).toMatchObject({
    contractVersion: 3,
    projectSnapshotJson: '{"steps":[]}',
  });
  expect(
    processScenarioEditorWithLlmMessageSchema.parse(
      createScenarioAiMessage({
        contractVersion: 3,
        projectOutlineJson: '{"slides":[]}',
        selectedSlideCodeJson: '{"id":"slide-1"}',
        toolManifestJson: '{"operations":["setSlideTitle"]}',
      })
    )
  ).toMatchObject({ contractVersion: 3 });
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
      createScenarioAiMessage({ selectedSlideCodeJson: 'x'.repeat(1_000_001) })
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
