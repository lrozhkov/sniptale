import {
  CONTENT_TEXT_FAILURE_CODES,
  CONTENT_TEXT_TIMEOUT_MS,
  CONTENT_TEXT_MAX_CHARS,
  CONTENT_TEXT_SYSTEM_PROMPT,
  type ContentTextClientMessage,
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
interface Job {
  flight: Promise<void>;
  cancel(): void;
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
      send: (message: ContentTextServerMessage) => void
    ) {
      let started = false;
      let disconnected = false;
      let activeId: string | undefined;
      let job: Job | undefined;
      const emit = (message: ContentTextServerMessage) => {
        if (!disconnected) send(message);
      };
      return {
        receive(message: ContentTextClientMessage) {
          if (disconnected || message.type === 'keepalive') return;
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
          }, CONTENT_TEXT_TIMEOUT_MS);
          const finish = (result: ContentTextServerMessage) => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            emit(result);
          };
          job = {
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
          const current = job;
          jobs.add(current);
          emit({ type: 'progress', requestId: message.requestId });
          current.flight = runContentTextRequest(message, sender, controller.signal, deps)
            .then((text) => {
              controller.signal.throwIfAborted();
              finish({ type: 'result', requestId: message.requestId, text });
            })
            .catch((error: unknown) => {
              const code: ContentTextFailureCode = controller.signal.aborted
                ? timedOut
                  ? 'timeout'
                  : 'cancelled'
                : (error instanceof Error &&
                    CONTENT_TEXT_FAILURE_CODES.find((entry) => entry === error.message)) ||
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
