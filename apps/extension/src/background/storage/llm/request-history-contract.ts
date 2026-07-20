export const LLM_REQUEST_HISTORY_ERROR_CODES = [
  'model-missing',
  'provider-invalid-response',
  'provider-failure',
  'unknown',
] as const;

export type LlmRequestHistoryErrorCode = (typeof LLM_REQUEST_HISTORY_ERROR_CODES)[number];

export interface LlmRequestHistoryEntry {
  modelId?: string;
  requestKind: 'json' | 'markdown';
  status: 'failure' | 'success';
  timestamp: number;
  resultCount: number;
  errorCode?: LlmRequestHistoryErrorCode;
}
