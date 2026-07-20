import { isChromeAiModelId } from '../../../../../../features/ai/chrome/constants';
import { runChromeAiContentJsonRequest } from '../../runtime/chrome/content-runner';
import {
  parseAiEditResponseJson,
  type ParsedAiEditResponse,
} from '../../../../../parser/dom-tree-parser/ai/edit-response';
import type {
  ProcessWithLLMMessage,
  ProcessWithLLMResponse,
} from '../../../../../../contracts/messaging/llm';
import { translate } from '../../../../../../platform/i18n';
import { createLogger } from '@sniptale/platform/observability/logger';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { getContentRuntimeServices } from '../../../../../application/runtime-services/services';
import { createContentAiEgressAuthority } from '../../../../../../features/ai/egress-authority';
import { requestLlmSessionToken } from '../../../../../../workflows/ai-session/llm-session';
import {
  createAiPrivacyProof,
  normalizeLlmPayloadForProvider,
  type AiPrivacyProof,
} from '../../../../../../features/ai/privacy';
import { createAllowlistedAiEditablePayload } from './payload';
import type { AiSubmitRequest } from './types';

const logger = createLogger({ namespace: 'ContentAiPickSubmit' });

function parseProviderResponse(
  response: ProcessWithLLMResponse | null | undefined,
  modelId: string | null | undefined
): ParsedAiEditResponse {
  if (!response) {
    throw new Error(translate('content.toolbar.aiNoBackgroundResponse'));
  }
  if (!response.success) {
    logger.warn('AI response failed', {
      modelId,
    });
    throw new Error(response.error ?? translate('content.toolbar.unknownError'));
  }
  if (!response.changes && !response.parseErrors) {
    throw new Error(translate('content.toolbar.aiEmptyResponse'));
  }

  logger.debug('AI response received', {
    changeCount: response.changes?.length ?? 0,
    hasData: Boolean(response.data),
    parseErrorCount: response.parseErrors?.length ?? 0,
  });
  return {
    changes: response.changes ?? [],
    errors: response.parseErrors ?? [],
  };
}

async function prepareSelectedEditablePayload(jsonData: string): Promise<{
  jsonData: string;
  privacyProof: AiPrivacyProof;
}> {
  const initialPrivacyPayload = { jsonData };
  const sourceOrigin = globalThis.location?.origin ?? null;
  const initialPrivacyProof = await createAiPrivacyProof({
    captureMode: 'selected_editable',
    payload: initialPrivacyPayload,
    riskClass: 'safe_text',
    sourceFrameId: 0,
    sourceOrigin,
    userInitiatedAiExtraction: true,
  });
  const normalizedPayload = await normalizeLlmPayloadForProvider({
    payload: initialPrivacyPayload,
    privacyProof: initialPrivacyProof,
  });
  const normalizedJsonData = normalizedPayload.jsonData;
  if (!normalizedJsonData) {
    throw new Error(translate('content.toolbar.aiNoData'));
  }

  const privacyPayload = { jsonData: normalizedJsonData };
  return {
    jsonData: normalizedJsonData,
    privacyProof: await createAiPrivacyProof({
      captureMode: 'selected_editable',
      payload: privacyPayload,
      riskClass: normalizedPayload.riskClass,
      sourceFrameId: 0,
      sourceOrigin,
      userInitiatedAiExtraction: true,
    }),
  };
}

export async function requestAiResponse({
  prompt,
  jsonData,
  modelId,
}: AiSubmitRequest): Promise<ParsedAiEditResponse> {
  const sanitizedJsonData = createAllowlistedAiEditablePayload(jsonData);
  if (sanitizedJsonData === null) {
    throw new Error(translate('content.toolbar.aiNoData'));
  }

  const preparedPayload = await prepareSelectedEditablePayload(sanitizedJsonData);

  if (isChromeAiModelId(modelId)) {
    const cleanedResponse = await runChromeAiContentJsonRequest({
      jsonData: preparedPayload.jsonData,
      modelId,
      privacyProof: preparedPayload.privacyProof,
      prompt,
    });
    return parseAiEditResponseJson(cleanedResponse);
  }

  const egressAuthority = await createContentAiEgressAuthority({
    payload: { jsonData: preparedPayload.jsonData },
    privacyProof: preparedPayload.privacyProof,
  });
  const llmSessionToken = await requestLlmSessionToken('content-ai-pick', egressAuthority);
  const response = await getContentRuntimeServices().messaging.sendRuntimeMessage({
    type: MessageType.PROCESS_WITH_LLM,
    jsonData: preparedPayload.jsonData,
    llmSessionToken,
    privacyProof: preparedPayload.privacyProof,
    prompt,
    ...(modelId == null ? {} : { modelId }),
  } satisfies ProcessWithLLMMessage);

  return parseProviderResponse(response, modelId);
}
