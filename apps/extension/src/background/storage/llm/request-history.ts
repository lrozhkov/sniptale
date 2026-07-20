import { browserStorage } from '../../../composition/persistence/infrastructure/browser-storage';
import { parseStoredLlmRequestHistoryEntries } from './request-history-codec';
import type { LlmRequestHistoryEntry } from './request-history-contract';

const LLM_REQUEST_HISTORY_STORAGE_KEY = 'llm_request_history';

export async function loadStoredRequestHistoryEntries(): Promise<LlmRequestHistoryEntry[]> {
  const result = await browserStorage.local.get([LLM_REQUEST_HISTORY_STORAGE_KEY]);
  return parseStoredLlmRequestHistoryEntries(result[LLM_REQUEST_HISTORY_STORAGE_KEY]);
}

export async function saveStoredRequestHistoryEntries(
  history: readonly LlmRequestHistoryEntry[]
): Promise<void> {
  await browserStorage.local.set({ [LLM_REQUEST_HISTORY_STORAGE_KEY]: history });
}
