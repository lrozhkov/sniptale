import type {
  ProcessScenarioEditorWithLLMMessage,
  ProcessScenarioEditorWithLLMResponse,
} from '../../../contracts/ai/scenario';
import type { ResponseSender } from '@sniptale/runtime-contracts/messaging/message-types';
import { translate } from '../../../platform/i18n';
import { createLogger } from '@sniptale/platform/observability/logger';
import { extractJSON, requestMultimodalChatCompletion } from './transport/request';
import { loadScenarioEditorSystemPrompt } from '../../../composition/persistence/ai-settings';
import { processScenarioEditorWithLlmMessageSchema } from '../../../contracts/messaging/scenario/ai-schemas';
import { scenarioAiOperationsResponseSchema } from '@sniptale/runtime-contracts/scenario-ai-operations';
import { resolveModelConfig } from './model-config';
import { respondAsyncLlmRoute, resolveRequiredLlmModelId } from './route-response';
import { assertScenarioEditorLlmPayloadLimits } from '../../../contracts/ai/payload-limits';
import {
  canonicalizeScenarioEditorEgressPayload,
  type ScenarioEditorCanonicalEgressPayload,
} from '../../../features/ai/egress-authority';
import { redactAiPayloadText } from '@sniptale/platform/security/ai-payload-privacy';
import { hasPreauthorizedScenarioEditorLlmRouteMessage } from './authorization/preauthorization';

const logger = createLogger({ namespace: 'BackgroundScenarioEditorLlmRoute' });

function isProcessScenarioEditorWithLLMMessage(
  message: unknown
): message is ProcessScenarioEditorWithLLMMessage {
  return processScenarioEditorWithLlmMessageSchema.safeParse(message).success;
}

function logScenarioEditorRequest(
  message: ProcessScenarioEditorWithLLMMessage,
  canonicalPayload: ScenarioEditorCanonicalEgressPayload
) {
  logger.debug('Processing scenario editor LLM request', {
    attachmentCount: message.attachments.length,
    hasModelId: Boolean(message.modelId),
    instructionLength: message.instruction.length,
    projectSnapshotLength: canonicalPayload.projectSnapshotJson.length,
  });
}

function buildScenarioEditorUserContent(
  message: ProcessScenarioEditorWithLLMMessage,
  canonicalPayload: ScenarioEditorCanonicalEgressPayload
) {
  return [
    {
      text: buildScenarioEditorV3UserText(message, canonicalPayload),
      type: 'text' as const,
    },
    ...canonicalPayload.attachments.map((attachment) => ({
      image_url: { url: attachment.dataUrl },
      type: 'image_url' as const,
    })),
  ];
}

function buildScenarioEditorV3UserText(
  message: ProcessScenarioEditorWithLLMMessage,
  canonicalPayload: ScenarioEditorCanonicalEgressPayload
) {
  return [
    'User instruction:',
    redactAiPayloadText(message.instruction),
    '',
    'Project outline JSON:',
    redactAiPayloadText(canonicalPayload.projectOutlineJson),
    '',
    'Selected slide code JSON:',
    redactAiPayloadText(canonicalPayload.selectedSlideCodeJson),
    '',
    'Tool manifest JSON:',
    redactAiPayloadText(canonicalPayload.toolManifestJson),
    '',
    'Project snapshot JSON:',
    redactAiPayloadText(canonicalPayload.projectSnapshotJson),
    '',
    'Return ONLY strict JSON with the shape {"operations":[...]} using the tool manifest.',
  ].join('\n');
}

function parseScenarioEditorResponse(rawResponse: string): ProcessScenarioEditorWithLLMResponse {
  const cleanedResponse = extractJSON(rawResponse);
  let parsedJson: unknown;

  try {
    parsedJson = JSON.parse(cleanedResponse) as unknown;
  } catch {
    return {
      error: translate('background.runtime.llmUnexpectedResponse'),
      success: false,
    };
  }

  return parseScenarioEditorV3Response(parsedJson);
}

function parseScenarioEditorV3Response(parsedJson: unknown): ProcessScenarioEditorWithLLMResponse {
  const parsedPayload = scenarioAiOperationsResponseSchema.safeParse(parsedJson);

  if (!parsedPayload.success) {
    return createScenarioEditorParseFailure();
  }

  return {
    operations: parsedPayload.data.operations,
    success: true,
  };
}

function createScenarioEditorParseFailure(): ProcessScenarioEditorWithLLMResponse {
  return {
    error: translate('background.runtime.llmUnexpectedResponse'),
    success: false,
  };
}

async function loadScenarioEditorRequestContext(modelId: string) {
  const [config, scenarioPrompt] = await Promise.all([
    resolveModelConfig(modelId),
    loadScenarioEditorSystemPrompt(),
  ]);

  return { config, scenarioPrompt };
}

async function processScenarioEditorRequest(
  message: ProcessScenarioEditorWithLLMMessage,
  canonicalPayload: ScenarioEditorCanonicalEgressPayload
): Promise<ProcessScenarioEditorWithLLMResponse> {
  logScenarioEditorRequest(message, canonicalPayload);

  const modelId = await resolveRequiredLlmModelId(message.modelId);
  const { config, scenarioPrompt } = await loadScenarioEditorRequestContext(modelId);
  const rawResponse = await requestMultimodalChatCompletion({
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    modelCode: config.modelCode,
    providerErrorLabel: config.providerId,
    systemPrompt: scenarioPrompt,
    userContent: buildScenarioEditorUserContent(message, canonicalPayload),
  });

  return parseScenarioEditorResponse(rawResponse);
}

export function routeScenarioEditorLlmMessage(
  message: unknown,
  sendResponse: ResponseSender<ProcessScenarioEditorWithLLMResponse>,
  _sender: chrome.runtime.MessageSender
): boolean {
  if (!isProcessScenarioEditorWithLLMMessage(message)) {
    return false;
  }

  if (!hasPreauthorizedScenarioEditorLlmRouteMessage(message)) {
    sendResponse({ success: false, error: 'Unauthorized LLM request' });
    return true;
  }

  let canonicalPayload: ScenarioEditorCanonicalEgressPayload;
  try {
    assertScenarioEditorLlmPayloadLimits(message);
    canonicalPayload = canonicalizeScenarioEditorEgressPayload(message);
  } catch (error) {
    sendResponse({
      success: false,
      error: error instanceof Error ? error.message : 'Invalid LLM request payload',
    });
    return true;
  }

  respondAsyncLlmRoute({
    work: processScenarioEditorRequest(message, canonicalPayload),
    sendResponse,
    logger,
    failureLogMessage: 'Scenario editor LLM request failed',
  });

  return true;
}
