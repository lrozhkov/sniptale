import { expect, it } from 'vitest';

import {
  assertContentAiPayloadLimits,
  assertProcessWithLlmPayloadLimits,
  assertScenarioEditorAiPayloadLimits,
  assertScenarioEditorLlmPayloadLimits,
} from './payload-limits';
import type { ScenarioAIAttachment } from './scenario';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { AiPrivacyProof } from '@sniptale/runtime-contracts/protocol/ai-privacy';

const VALID_PAYLOAD_HASH =
  'sha256:1111111111111111111111111111111111111111111111111111111111111111';

const privacyProof = {
  captureMode: 'selected_editable',
  createdAtEpochMs: Date.now(),
  generation: 'proof-1',
  payloadHash: VALID_PAYLOAD_HASH,
  riskClass: 'safe_text',
  userInitiatedAiExtraction: true,
} satisfies AiPrivacyProof;

it('rejects content AI text payloads by decoded byte budget before provider work', () => {
  expect(() =>
    assertContentAiPayloadLimits({
      jsonData: '\u0800'.repeat(700_000),
      prompt: 'edit',
    })
  ).toThrow('jsonData exceeds 2000000 decoded bytes');
  expect(() =>
    assertProcessWithLlmPayloadLimits({
      jsonData: '\u0800'.repeat(700_000),
      llmSessionToken: 'session-token',
      privacyProof,
      prompt: 'edit',
      type: MessageType.PROCESS_WITH_LLM,
    })
  ).toThrow('jsonData exceeds 2000000 decoded bytes');
});

it('rejects content AI text payloads by character budget before provider work', () => {
  expect(() =>
    assertContentAiPayloadLimits({
      prompt: 'x'.repeat(16_001),
    })
  ).toThrow('prompt exceeds 16000 characters');
  expect(() =>
    assertContentAiPayloadLimits({
      markdownData: 'x'.repeat(1_000_001),
      prompt: 'edit',
    })
  ).toThrow('markdownData exceeds 1000000 characters');
});

it('rejects scenario attachment payloads by decoded byte budget before provider work', () => {
  const payload = 'a'.repeat(9_333_336);
  const attachment: ScenarioAIAttachment = {
    dataUrl: `data:image/png;base64,${payload}`,
    filename: 'oversized.png',
    mimeType: 'image/png',
    stepId: 'step-1',
    stepNumber: 1,
  };

  expect(() =>
    assertScenarioEditorAiPayloadLimits({
      attachments: [attachment],
      contractVersion: 3,
      instruction: 'summarize',
      projectSnapshotJson: '{}',
    })
  ).toThrow('attachments[].dataUrl exceeds 7000000 decoded bytes');
  expect(() =>
    assertScenarioEditorLlmPayloadLimits({
      attachments: [attachment],
      contractVersion: 3,
      instruction: 'summarize',
      llmSessionToken: 'session-token',
      projectSnapshotJson: '{}',
      type: 'PROCESS_SCENARIO_EDITOR_WITH_LLM',
    })
  ).toThrow('attachments[].dataUrl exceeds 7000000 decoded bytes');
});

it('rejects scenario payloads that exceed text or attachment count budgets', () => {
  const attachments: ScenarioAIAttachment[] = Array.from({ length: 21 }, (_, index) => ({
    dataUrl: 'data:image/png;base64,AA==',
    filename: `shot-${index}.png`,
    mimeType: 'image/png',
    stepId: `step-${index}`,
    stepNumber: index + 1,
  }));

  expect(() =>
    assertScenarioEditorAiPayloadLimits({
      attachments: [],
      contractVersion: 3,
      instruction: 'x'.repeat(16_001),
      projectSnapshotJson: '{}',
    })
  ).toThrow('instruction exceeds 16000 characters');
  expect(() =>
    assertScenarioEditorAiPayloadLimits({
      attachments,
      contractVersion: 3,
      instruction: 'summarize',
      projectSnapshotJson: '{}',
    })
  ).toThrow('attachments exceeds 20 items');
});

it('rejects unsafe scenario attachment data URLs before provider work', () => {
  const baseAttachment: ScenarioAIAttachment = {
    dataUrl: 'data:image/png;base64,AA==',
    filename: 'shot.png',
    mimeType: 'image/png',
    stepId: 'step-1',
    stepNumber: 1,
  };

  for (const attachment of [
    { ...baseAttachment, dataUrl: 'data:image/svg+xml;base64,PHN2Zy8+' },
    { ...baseAttachment, dataUrl: 'data:text/html;base64,PGgxPmhpPC9oMT4=' },
    { ...baseAttachment, dataUrl: 'data:image/png;base64,not valid!' },
    { ...baseAttachment, dataUrl: 'data:image/png;base64,AAA' },
    {
      ...baseAttachment,
      dataUrl: 'data:image/png;base64,AA==',
      mimeType: 'image/jpeg',
    },
  ]) {
    expect(() =>
      assertScenarioEditorAiPayloadLimits({
        attachments: [attachment],
        contractVersion: 3,
        instruction: 'summarize',
        projectSnapshotJson: '{}',
      })
    ).toThrow('attachments[].dataUrl must be a raster image data URL');
  }
});
