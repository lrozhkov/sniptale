import { createTextJobLifecycle } from './text-job-lifecycle';
import {
  REVIEW_TEXT_FAILURE_CODES,
  REVIEW_TEXT_TIMEOUT_MS,
  REVIEW_TEXT_RESPONSE_MAX_BYTES,
  REVIEW_TEXT_SYSTEM_PROMPT,
  parseReviewTextProposal,
  type ReviewTextFailureCode,
  type ReviewTextServerMessage,
  type ReviewTextStart,
} from '../../../contracts/ai/review-text';
import { authorizeReviewText, assertReviewTextJobScope } from './authorization/review-text';
import { resolveModelConfig } from './model-config';
import { requestChatCompletion, extractJSON } from './transport/request';
import { saveRequestHistory } from './service-history';

interface Dependencies {
  authorize: typeof authorizeReviewText;
  resolveModel: typeof resolveModelConfig;
  request: typeof requestChatCompletion;
  history: typeof saveRequestHistory;
  assertScope: typeof assertReviewTextJobScope;
}
/** Every one-shot Port owns cancellation before authorization awaits; erasure drains that same flight. */
export function createReviewTextJobService(overrides: Partial<Dependencies> = {}) {
  const deps: Dependencies = {
    authorize: authorizeReviewText,
    resolveModel: resolveModelConfig,
    request: requestChatCompletion,
    history: saveRequestHistory,
    assertScope: assertReviewTextJobScope,
    ...overrides,
  };
  return createTextJobLifecycle<
    ReviewTextStart,
    ReviewTextServerMessage,
    Awaited<ReturnType<typeof run>>,
    ReviewTextFailureCode
  >({
    timeoutMs: REVIEW_TEXT_TIMEOUT_MS,
    failureCodes: REVIEW_TEXT_FAILURE_CODES,
    run: (request, sender, signal, emit) => run(request, sender, signal, deps, emit),
    progress: (request) => ({
      type: 'progress',
      requestId: request.requestId,
      phase: 'authorizing',
    }),
    result: (request, proposal) => ({ type: 'proposal', requestId: request.requestId, proposal }),
    failure: (request, code) => ({ type: 'failure', requestId: request.requestId, code }),
  });
}

async function run(
  request: ReviewTextStart,
  sender: chrome.runtime.MessageSender,
  signal: AbortSignal,
  deps: Dependencies,
  send: (message: ReviewTextServerMessage) => void
) {
  await deps.authorize(request, sender, signal);
  signal.throwIfAborted();
  const approved = {
    approvedProviderId: request.approvedProviderId,
    approvedDestination: request.approvedDestination,
    approvedModelCode: request.approvedModelCode,
    signal,
  };
  await deps.resolveModel(request.modelId, approved);
  signal.throwIfAborted();
  await deps.assertScope(request, signal);
  signal.throwIfAborted();
  const config = await deps.resolveModel(request.modelId, approved);
  signal.throwIfAborted();
  await deps.assertScope(request, signal);
  signal.throwIfAborted();
  send({ type: 'progress', requestId: request.requestId, phase: 'requesting' });
  try {
    const content = await deps.request({
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      modelCode: config.modelCode,
      connectionType: config.connectionType,
      ...(config.maxOutputTokens ? { maxOutputTokens: config.maxOutputTokens } : {}),
      systemPrompt: REVIEW_TEXT_SYSTEM_PROMPT,
      userPrompt: JSON.stringify(request.context),
      signal,
      beforeSend: async () => {
        signal.throwIfAborted();
        const current = await deps.resolveModel(request.modelId, approved);
        if (JSON.stringify(current) !== JSON.stringify(config))
          throw new Error('model-unavailable');
        await deps.assertScope(request, signal);
        signal.throwIfAborted();
      },
    });
    signal.throwIfAborted();
    send({ type: 'progress', requestId: request.requestId, phase: 'receiving' });
    if (new TextEncoder().encode(content).byteLength > REVIEW_TEXT_RESPONSE_MAX_BYTES)
      throw new Error('too-large');
    let raw: unknown;
    try {
      raw = JSON.parse(extractJSON(content)) as unknown;
    } catch {
      throw new Error('invalid-response');
    }
    const proposal = parseReviewTextProposal(raw, request.context);
    if (!proposal) throw new Error('invalid-response');
    await deps.history({
      modelId: request.modelId,
      requestKind: 'json',
      resultCount: proposal.fragments.length,
    });
    signal.throwIfAborted();
    return proposal;
  } catch (error) {
    if (!signal.aborted)
      await deps.history({
        modelId: request.modelId,
        requestKind: 'json',
        resultCount: 0,
        status: 'failure',
        errorCode: 'provider-failure',
      });
    throw error;
  }
}
export type ReviewTextJobService = ReturnType<typeof createReviewTextJobService>;
