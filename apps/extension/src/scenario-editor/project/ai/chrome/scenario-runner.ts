import {
  createChromeAiSession,
  createChromeAiSystemPromptMessage,
} from '@sniptale/platform/browser/chrome-ai';
import { requestScenarioEditorSystemPrompt } from '../../../../workflows/ai-settings/query';
import { redactAiPayloadText } from '@sniptale/platform/security/ai-payload-privacy';
import type {
  ProcessScenarioEditorWithLLMMessage,
  ProcessScenarioEditorWithLLMResponse,
  ScenarioAIAttachment,
} from '../../../../contracts/ai/scenario';
import { assertScenarioEditorAiPayloadLimits } from '../../../../contracts/ai/payload-limits';
import { parseChromeAiScenarioResponse } from './response';

function convertScenarioAttachmentToPromptPart(attachment: ScenarioAIAttachment): {
  type: 'image';
  value: Blob;
} {
  const [header, base64Data] = attachment.dataUrl.split(',', 2);
  const mimeType = header?.match(/^data:(.*?);base64$/)?.[1] || attachment.mimeType;
  const binary = atob(base64Data ?? '');
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));

  return {
    type: 'image',
    value: new Blob([bytes], { type: mimeType }),
  };
}

function buildScenarioPromptParts(args: {
  attachments: ScenarioAIAttachment[];
  contractVersion: ProcessScenarioEditorWithLLMMessage['contractVersion'];
  instruction: string;
  projectOutlineJson?: string | undefined;
  projectSnapshotJson: string;
  selectedSlideCodeJson?: string | undefined;
  toolManifestJson?: string | undefined;
}) {
  return [
    {
      type: 'text' as const,
      value: buildScenarioV3PromptText(args),
    },
    ...args.attachments.map(convertScenarioAttachmentToPromptPart),
  ];
}

function buildScenarioV3PromptText(args: {
  instruction: string;
  projectOutlineJson?: string | undefined;
  projectSnapshotJson: string;
  selectedSlideCodeJson?: string | undefined;
  toolManifestJson?: string | undefined;
}) {
  return [
    'User instruction:',
    redactAiPayloadText(args.instruction),
    '',
    'Project outline JSON:',
    redactAiPayloadText(args.projectOutlineJson ?? '{}'),
    '',
    'Selected slide code JSON:',
    redactAiPayloadText(args.selectedSlideCodeJson ?? '{}'),
    '',
    'Tool manifest JSON:',
    redactAiPayloadText(args.toolManifestJson ?? '{}'),
    '',
    'Project snapshot JSON:',
    redactAiPayloadText(args.projectSnapshotJson),
    '',
    'Return ONLY strict JSON with the shape {"operations":[...]} using the tool manifest.',
  ].join('\n');
}

export async function runChromeAiScenarioRequest(args: {
  attachments: ScenarioAIAttachment[];
  contractVersion: ProcessScenarioEditorWithLLMMessage['contractVersion'];
  instruction: string;
  projectOutlineJson?: string | undefined;
  projectSnapshotJson: string;
  selectedSlideCodeJson?: string | undefined;
  toolManifestJson?: string | undefined;
}): Promise<ProcessScenarioEditorWithLLMResponse> {
  assertScenarioEditorAiPayloadLimits(args);
  const scenarioPrompt = await requestScenarioEditorSystemPrompt();
  const session = await createChromeAiSession({
    initialPrompts: createChromeAiSystemPromptMessage(scenarioPrompt),
  });

  try {
    const rawResponse = await session.prompt([
      {
        role: 'user',
        content: buildScenarioPromptParts(args),
      },
    ]);

    return parseChromeAiScenarioResponse(rawResponse, args.contractVersion);
  } finally {
    session.destroy();
  }
}
