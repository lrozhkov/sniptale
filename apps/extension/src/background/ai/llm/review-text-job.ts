import {
  REVIEW_TEXT_FAILURE_CODES,
  REVIEW_TEXT_TIMEOUT_MS,
  REVIEW_TEXT_RESPONSE_MAX_BYTES,
  REVIEW_TEXT_SYSTEM_PROMPT,
  parseReviewTextProposal,
  type ReviewTextClientMessage,
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
interface Job {
  controller: AbortController;
  flight: Promise<void>;
  cancel(): void;
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
  const jobs = new Set<Job>();
  let reservations = 0;
  return {
    reserveErasureExclusion() {
      reservations++;
      let released = false;
      return {
        release() {
          if (!released) {
            released = true;
            reservations--;
          }
        },
        async waitForActiveMutations() {
          await Promise.allSettled([...jobs].map((job) => job.flight));
        },
      };
    },
    async cancelActiveJob() {
      const active = [...jobs];
      active.forEach((job) => job.cancel());
      await Promise.allSettled(active.map((job) => job.flight));
    },
    connect(
      sender: chrome.runtime.MessageSender,
      send: (message: ReviewTextServerMessage) => void
    ) {
      let started = false;
      let disconnected = false;
      let job: Job | undefined;
      let activeId: string | undefined;
      const emit = (message: ReviewTextServerMessage) => {
        if (!disconnected) send(message);
      };
      return {
        receive(message: ReviewTextClientMessage) {
          if (disconnected) return;
          if (message.type === 'keepalive') return;
          if (message.type === 'cancel') {
            if (message.requestId === activeId) job?.cancel();
            return;
          }
          if (started || reservations > 0) {
            emit({ type: 'failure', requestId: message.requestId, code: 'invalid-request' });
            return;
          }
          started = true;
          activeId = message.requestId;
          const controller = new AbortController();
          let done = false;
          let timedOut = false;
          const timer = setTimeout(() => {
            timedOut = true;
            job?.cancel();
          }, REVIEW_TEXT_TIMEOUT_MS);
          const finish = (result: ReviewTextServerMessage) => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            emit(result);
          };
          job = {
            controller,
            flight: Promise.resolve(),
            cancel() {
              controller.abort();
              finish({
                type: 'failure',
                requestId: message.requestId,
                code: timedOut ? 'timeout' : 'cancelled',
              });
            },
          };
          jobs.add(job);
          emit({ type: 'progress', requestId: message.requestId, phase: 'authorizing' });
          const current = job;
          current.flight = run(message, sender, controller.signal, deps, emit)
            .then((proposal) => {
              controller.signal.throwIfAborted();
              finish({ type: 'proposal', requestId: message.requestId, proposal });
            })
            .catch((error: unknown) => {
              const code: ReviewTextFailureCode = controller.signal.aborted
                ? timedOut
                  ? 'timeout'
                  : 'cancelled'
                : (error instanceof Error &&
                    REVIEW_TEXT_FAILURE_CODES.find((entry) => entry === error.message)) ||
                  'provider-failed';
              finish({ type: 'failure', requestId: message.requestId, code });
            })
            .finally(() => {
              clearTimeout(timer);
              jobs.delete(current);
            });
        },
        async disconnect() {
          disconnected = true;
          job?.cancel();
          await job?.flight;
        },
      };
    },
  };
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
  send({ type: 'progress', requestId: request.requestId, phase: 'requesting' });
  try {
    const content = await deps.request({
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      modelCode: config.modelCode,
      systemPrompt: REVIEW_TEXT_SYSTEM_PROMPT,
      userPrompt: JSON.stringify(request.context),
      signal,
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
