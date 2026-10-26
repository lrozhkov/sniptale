import { createTextJobLifecycle } from './text-job-lifecycle';
import {
  CONTENT_TEXT_FAILURE_CODES,
  CONTENT_TEXT_TIMEOUT_MS,
  CONTENT_TEXT_MAX_CHARS,
  CONTENT_TEXT_SYSTEM_PROMPT,
  type ContentTextServerMessage,
  type ContentTextStart,
  type ContentTextFailureCode,
} from '../../../contracts/ai/content-text';
import { prepareProviderContentAiEgress } from '../../../features/ai/content-egress-pipeline';
import { authorizeContentText } from './authorization/content-text';
import { resolveModelConfig } from './model-config';
import { requestChatCompletion } from './transport/request';
import { saveRequestHistory } from './service-history';

interface Dependencies {
  authorize: typeof authorizeContentText;
  resolveModel: typeof resolveModelConfig;
  prepare: typeof prepareProviderContentAiEgress;
  request: typeof requestChatCompletion;
  history: typeof saveRequestHistory;
}
/** Owns each content request from admission through cancellation and metadata settlement. */
export function createContentTextJobService(overrides: Partial<Dependencies> = {}) {
  const deps: Dependencies = {
    authorize: authorizeContentText,
    resolveModel: resolveModelConfig,
    prepare: prepareProviderContentAiEgress,
    request: requestChatCompletion,
    history: saveRequestHistory,
    ...overrides,
  };
  return createTextJobLifecycle<
    ContentTextStart,
    ContentTextServerMessage,
    string,
    ContentTextFailureCode
  >({
    timeoutMs: CONTENT_TEXT_TIMEOUT_MS,
    failureCodes: CONTENT_TEXT_FAILURE_CODES,
    run: (request, sender, signal) => runContentTextRequest(request, sender, signal, deps),
    progress: (request) => ({ type: 'progress', requestId: request.requestId }),
    result: (request, text) => ({ type: 'result', requestId: request.requestId, text }),
    failure: (request, code) => ({ type: 'failure', requestId: request.requestId, code }),
  });
}

async function runContentTextRequest(
  request: ContentTextStart,
  sender: chrome.runtime.MessageSender,
  signal: AbortSignal,
  deps: Dependencies
): Promise<string> {
  await deps.authorize(request, sender, signal);
  signal.throwIfAborted();
  const egress = await deps.prepare({
    markdownData: request.text,
    prompt: request.prompt,
    privacyProof: request.privacyProof,
  });
  signal.throwIfAborted();
  if (egress.payloadKind !== 'markdown') throw new Error('invalid-request');
  const approved = {
    approvedProviderId: request.approvedProviderId,
    approvedDestination: request.approvedDestination,
    approvedModelCode: request.approvedModelCode,
    signal,
  };
  const config = await deps.resolveModel(request.modelId, approved);
  signal.throwIfAborted();
  try {
    const text = await deps.request({
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      modelCode: config.modelCode,
      connectionType: config.connectionType,
      ...(config.maxOutputTokens ? { maxOutputTokens: config.maxOutputTokens } : {}),
      systemPrompt: `${config.effectiveSystemPrompt}\n\n${CONTENT_TEXT_SYSTEM_PROMPT}`,
      userPrompt: `Selected text:\n${egress.request.markdownData}\n\nUser instruction:\n${egress.request.prompt}`,
      signal,
      rejectTruncated: true,
      beforeSend: async () => {
        signal.throwIfAborted();
        const current = await deps.resolveModel(request.modelId, approved);
        if (JSON.stringify(current) !== JSON.stringify(config))
          throw new Error('model-unavailable');
        signal.throwIfAborted();
      },
    });
    signal.throwIfAborted();
    if (!text.trim()) throw new Error('invalid-response');
    if (text.length > CONTENT_TEXT_MAX_CHARS) throw new Error('too-large');
    await deps.history({ modelId: request.modelId, requestKind: 'markdown', resultCount: 1 });
    signal.throwIfAborted();
    return text;
  } catch (error) {
    if (!signal.aborted)
      await deps.history({
        modelId: request.modelId,
        requestKind: 'markdown',
        resultCount: 0,
        status: 'failure',
        errorCode: 'provider-failure',
      });
    throw error;
  }
}
export type ContentTextJobService = ReturnType<typeof createContentTextJobService>;
