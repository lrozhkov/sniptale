import { translate } from '../../../../../../platform/i18n';
import { createLogger } from '@sniptale/platform/observability/logger';
import { showToast } from '@sniptale/ui/product-feedback/toast-service';
import { applyAiResponseChanges } from './apply';
import { canSubmitAiPickPrompt } from './preconditions';
import { requestAiResponse } from './request';
import type { AiPickSubmitContext } from './types';

const logger = createLogger({ namespace: 'ContentAiPickSubmit' });

function validateAiPickSubmission(
  context: AiPickSubmitContext,
  prompt: string,
  modelId?: string | null
): string | null {
  const trimmedPrompt = prompt.trim();
  if (!trimmedPrompt) {
    return translate('content.toolbar.aiPromptRequired');
  }

  if (canSubmitAiPickPrompt({ isLoading: context.isAILoading, prompt, selectedModelId: modelId })) {
    return null;
  }

  if (context.isAILoading) {
    return '';
  }

  return translate('background.runtime.llmModelMissing');
}

function resolveAiPickRequestPayload(args: {
  modelId?: string | null;
  prompt: string;
  selectedData?: string;
  treeData: NonNullable<AiPickSubmitContext['treeData']>;
}) {
  const jsonData = args.selectedData;
  if (!jsonData) {
    throw new Error(translate('content.toolbar.aiNoData'));
  }

  return {
    cleanedRequest: {
      prompt: args.prompt,
      jsonData,
      ...(args.modelId == null ? {} : { modelId: args.modelId }),
    },
    jsonData,
  };
}

function logAiPickSubmission(args: {
  jsonData: string;
  modelId?: string | null;
  prompt: string;
  selectedData?: string;
}): void {
  logger.debug('Submitting AI pick prompt', {
    hasSelectedData: Boolean(args.selectedData),
    jsonLength: args.jsonData.length,
    modelId: args.modelId,
    promptLength: args.prompt.length,
  });
}

async function requestAndApplyAiPickChanges(args: {
  context: AiPickSubmitContext;
  modelId?: string | null;
  prompt: string;
  requestId: number;
  selectedData?: string;
  treeData: NonNullable<AiPickSubmitContext['treeData']>;
}): Promise<void> {
  const { cleanedRequest, jsonData } = resolveAiPickRequestPayload({
    prompt: args.prompt,
    treeData: args.treeData,
    ...(args.modelId === undefined ? {} : { modelId: args.modelId }),
    ...(args.selectedData === undefined ? {} : { selectedData: args.selectedData }),
  });
  logAiPickSubmission({
    jsonData,
    prompt: args.prompt,
    ...(args.modelId === undefined ? {} : { modelId: args.modelId }),
    ...(args.selectedData === undefined ? {} : { selectedData: args.selectedData }),
  });
  const parsedResponse = await requestAiResponse(cleanedRequest);
  if (!args.context.requestGate.isCurrent(args.requestId)) {
    return;
  }

  await applyAiResponseChanges(parsedResponse, args.treeData, args.context, args.requestId);
}

export async function submitAiPickPrompt(
  context: AiPickSubmitContext,
  prompt: string,
  selectedData?: string,
  modelId?: string | null
) {
  const validationMessage = validateAiPickSubmission(context, prompt, modelId);
  if (validationMessage !== null) {
    if (validationMessage) {
      showToast(validationMessage, 'warning');
    }
    return;
  }

  const trimmedPrompt = prompt.trim();
  const { treeData } = context;
  if (!treeData) {
    showToast(translate('content.toolbar.aiNoData'), 'error');
    return;
  }

  const requestId = context.requestGate.begin();
  context.setIsAILoading(true);
  try {
    await requestAndApplyAiPickChanges({
      context,
      prompt: trimmedPrompt,
      requestId,
      treeData,
      ...(modelId === undefined ? {} : { modelId }),
      ...(selectedData === undefined ? {} : { selectedData }),
    });
  } catch (error) {
    if (context.requestGate.isCurrent(requestId)) {
      handleAiSubmissionError(error);
    }
  } finally {
    if (context.requestGate.finish(requestId)) {
      context.setIsAILoading(false);
    }
  }
}

function handleAiSubmissionError(error: unknown) {
  logger.error('AI prompt submission failed', error);
  const errorMessage =
    error instanceof Error ? error.message : translate('content.toolbar.unknownError');
  showToast(`${translate('content.toolbar.aiErrorPrefix')} ${errorMessage}`, 'error');
}
