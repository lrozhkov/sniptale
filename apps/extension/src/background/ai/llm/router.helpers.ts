import { createLogger } from '@sniptale/platform/observability/logger';
import { resolveRequestHistoryErrorCode, type LlmRequestHistoryErrorCode } from './service-history';

type LlmRequestMessage = {
  prompt: string;
  jsonData?: string | undefined;
  markdownData?: string | undefined;
  modelId?: string | null | undefined;
};

const logger = createLogger({ namespace: 'BackgroundLlmRoute' });

export function createHistoryEntryArgs(args: {
  errorCode: LlmRequestHistoryErrorCode | undefined;
  modelId: string | null | undefined;
  requestKind: 'json' | 'markdown';
  resultCount: number;
  status: 'failure' | 'success' | undefined;
}) {
  return {
    requestKind: args.requestKind,
    resultCount: args.resultCount,
    ...(args.errorCode !== undefined ? { errorCode: args.errorCode } : {}),
    ...(args.modelId ? { modelId: args.modelId } : {}),
    ...(args.status !== undefined ? { status: args.status } : {}),
  };
}

export function logLLMRequest(message: LlmRequestMessage): void {
  logger.debug('Processing LLM request', {
    hasJsonData: Boolean(message.jsonData),
    hasMarkdownData: Boolean(message.markdownData),
    modelId: message.modelId,
    promptLength: message.prompt.length,
  });
}

export function resolveRequestKind(message: LlmRequestMessage): 'json' | 'markdown' {
  if (message.jsonData) {
    return 'json';
  }

  return 'markdown';
}

export function resolveFailureHistoryErrorCode(error: unknown) {
  return resolveRequestHistoryErrorCode(error);
}
