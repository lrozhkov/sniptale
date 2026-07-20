import type { createLogger } from '@sniptale/platform/observability/logger';
import { translate } from '../../../platform/i18n';
import {
  initializeAiStorageAccess,
  loadDefaultModelId,
} from '../../../composition/persistence/ai-settings';
import type { ResponseSender } from '@sniptale/runtime-contracts/messaging/message-types';

interface LlmRouteErrorDetails {
  error?: string | undefined;
}

interface LlmRouteResponseShape extends LlmRouteErrorDetails {
  success: boolean;
}

interface LlmRouteFailure extends LlmRouteErrorDetails {
  error: string;
  success: false;
}

type LlmRouteLogger = Pick<ReturnType<typeof createLogger>, 'error'>;

function getOptionalString(
  candidate: Record<string, unknown>,
  key: keyof LlmRouteErrorDetails
): string | undefined {
  const value = candidate[key];
  return typeof value === 'string' ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function resolveRequiredLlmModelId(modelId?: string | null): Promise<string> {
  if (modelId) {
    return modelId;
  }

  await initializeAiStorageAccess();
  const resolvedModelId = await loadDefaultModelId();
  if (!resolvedModelId) {
    throw new Error(translate('background.runtime.llmModelMissing'));
  }

  return resolvedModelId;
}

export function normalizeLlmRouteError(error: unknown): LlmRouteFailure {
  const details = getLlmRouteErrorDetails(error);

  return {
    success: false,
    error:
      details.error ??
      (error instanceof Error ? error.message : translate('content.runtime.unknownError')),
  };
}

export function respondAsyncLlmRoute<TResponse extends LlmRouteResponseShape>(args: {
  work: Promise<TResponse>;
  sendResponse: ResponseSender<TResponse>;
  logger: LlmRouteLogger;
  failureLogMessage: string;
}): void {
  args.work
    .then((response) => {
      args.sendResponse(response);
    })
    .catch((error) => {
      args.logger.error(args.failureLogMessage, error);
      args.sendResponse(normalizeLlmRouteError(error) as TResponse);
    });
}

function getLlmRouteErrorDetails(error: unknown): LlmRouteErrorDetails {
  if (!isRecord(error)) {
    return {};
  }

  const routeError = getOptionalString(error, 'error');

  return {
    ...(routeError !== undefined ? { error: routeError } : {}),
  };
}
