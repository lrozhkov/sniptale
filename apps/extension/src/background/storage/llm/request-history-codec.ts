import {
  LLM_REQUEST_HISTORY_ERROR_CODES,
  type LlmRequestHistoryEntry,
  type LlmRequestHistoryErrorCode,
} from './request-history-contract';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isLlmRequestHistoryErrorCode(value: unknown): value is LlmRequestHistoryErrorCode {
  return (
    typeof value === 'string' &&
    (LLM_REQUEST_HISTORY_ERROR_CODES as readonly string[]).includes(value)
  );
}

function parseStoredLlmRequestHistoryEntry(value: unknown): LlmRequestHistoryEntry | null {
  if (!isRecord(value)) {
    return null;
  }

  if (
    typeof value['timestamp'] !== 'number' ||
    typeof value['resultCount'] !== 'number' ||
    (value['status'] !== 'success' && value['status'] !== 'failure') ||
    (value['requestKind'] !== 'json' && value['requestKind'] !== 'markdown') ||
    (value['modelId'] !== undefined && typeof value['modelId'] !== 'string') ||
    (value['errorCode'] !== undefined && !isLlmRequestHistoryErrorCode(value['errorCode']))
  ) {
    return null;
  }

  const modelId = typeof value['modelId'] === 'string' ? value['modelId'] : undefined;
  const errorCode = isLlmRequestHistoryErrorCode(value['errorCode'])
    ? value['errorCode']
    : undefined;

  return {
    timestamp: value['timestamp'],
    requestKind: value['requestKind'],
    resultCount: value['resultCount'],
    status: value['status'],
    ...(modelId !== undefined ? { modelId } : {}),
    ...(errorCode !== undefined ? { errorCode } : {}),
  };
}

export function parseStoredLlmRequestHistoryEntries(value: unknown): LlmRequestHistoryEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(parseStoredLlmRequestHistoryEntry)
    .filter((entry): entry is LlmRequestHistoryEntry => entry !== null);
}
