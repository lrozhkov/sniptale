import { createLogger } from '@sniptale/platform/observability/logger';
import {
  loadStoredRequestHistoryEntries,
  saveStoredRequestHistoryEntries,
} from '../../storage/llm/request-history';
import type {
  LlmRequestHistoryEntry,
  LlmRequestHistoryErrorCode,
} from '../../storage/llm/request-history-contract';
export type { LlmRequestHistoryErrorCode } from '../../storage/llm/request-history-contract';

const logger = createLogger({ namespace: 'BackgroundLlmHistory' });
let requestHistoryWriteQueue = Promise.resolve<void>(undefined);

export function resolveRequestHistoryErrorCode(error: unknown): LlmRequestHistoryErrorCode {
  let message = '';
  if (typeof error === 'string') {
    message = error;
  } else if (
    typeof error === 'object' &&
    error !== null &&
    'error' in error &&
    typeof error.error === 'string'
  ) {
    message = error.error;
  } else if (error instanceof Error) {
    message = error.message;
  }

  const normalized = message.toLowerCase();
  const referencesModel = normalized.includes('model') || normalized.includes('модель');
  const describesMissingSelection =
    normalized.includes('missing') ||
    normalized.includes('selected') ||
    normalized.includes('выбра');
  if (referencesModel && describesMissingSelection) {
    return 'model-missing';
  }
  if (
    normalized.includes('json') ||
    normalized.includes('parse') ||
    normalized.includes('schema') ||
    normalized.includes('invalid')
  ) {
    return 'provider-invalid-response';
  }

  return message.length > 0 ? 'provider-failure' : 'unknown';
}

function queueRequestHistoryWrite(run: () => Promise<void>): Promise<void> {
  const nextWrite = requestHistoryWriteQueue.catch(() => undefined).then(run);
  requestHistoryWriteQueue = nextWrite.then(
    () => undefined,
    () => undefined
  );
  return nextWrite;
}

async function persistRequestHistory(entry: {
  error?: string;
  errorCode?: LlmRequestHistoryErrorCode;
  modelId?: string;
  requestKind: LlmRequestHistoryEntry['requestKind'];
  resultCount: number;
  status?: LlmRequestHistoryEntry['status'];
}): Promise<void> {
  try {
    const history = await loadStoredRequestHistoryEntries();

    history.unshift({
      timestamp: Date.now(),
      requestKind: entry.requestKind,
      resultCount: entry.resultCount,
      status: entry.status ?? 'success',
      ...(entry.modelId !== undefined ? { modelId: entry.modelId } : {}),
      ...(entry.status === 'failure'
        ? { errorCode: entry.errorCode ?? resolveRequestHistoryErrorCode(entry.error) }
        : {}),
    });

    const trimmed = history.slice(0, 10);

    await saveStoredRequestHistoryEntries(trimmed);

    logger.log('Request history saved');
  } catch (error) {
    logger.error('Failed to save request history', error);
  }
}

export function saveRequestHistory(
  entry: Parameters<typeof persistRequestHistory>[0]
): Promise<void> {
  return queueRequestHistoryWrite(() => persistRequestHistory(entry));
}

export async function getRequestHistory(): Promise<LlmRequestHistoryEntry[]> {
  try {
    return await loadStoredRequestHistoryEntries();
  } catch (error) {
    logger.error('Failed to load request history', error);
    return [];
  }
}

export function resetRequestHistoryWriteQueueForTests(): void {
  requestHistoryWriteQueue = Promise.resolve<void>(undefined);
}
