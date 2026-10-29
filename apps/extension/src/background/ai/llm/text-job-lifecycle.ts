import { AIProviderRequestError } from '../providers';
import type { AIConnectionReason } from '../../../contracts/settings/ai-catalog';
type LifecycleFailure = 'invalid-request' | 'cancelled' | 'timeout' | 'provider-failed';
type TextStart = { type: 'start'; requestId: string };
type TextCommand<Start> =
  | Start
  | { type: 'cancel'; requestId: string }
  | { type: 'keepalive'; requestId: string };

interface TextJobAdapter<Start, Server, Result, Failure extends string> {
  timeoutMs: number;
  failureCodes: readonly Failure[];
  run(
    request: Start,
    sender: chrome.runtime.MessageSender,
    signal: AbortSignal,
    emit: (message: Server) => void
  ): Promise<Result>;
  progress(request: Start): Server;
  result(request: Start, result: Result): Server;
  failure(
    request: Start,
    code: Failure | LifecycleFailure,
    failureReason?: AIConnectionReason
  ): Server;
}

interface TextJob {
  flight: Promise<void>;
  cancel(): void;
}

/** Owns one service's text-job admission and cancellation until its metadata writes settle. */
export function createTextJobLifecycle<
  Start extends TextStart,
  Server,
  Result,
  Failure extends string,
>(adapter: TextJobAdapter<Start, Server, Result, Failure>) {
  const jobs = new Set<TextJob>();
  let reservations = 0;
  return {
    reserveErasureExclusion() {
      reservations++;
      let released = false;
      return {
        release() {
          if (released) return;
          released = true;
          reservations--;
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
    connect(sender: chrome.runtime.MessageSender, send: (message: Server) => void) {
      let started = false;
      let disconnected = false;
      let activeId: string | undefined;
      let job: TextJob | undefined;
      const emit = (message: Server) => {
        if (!disconnected) send(message);
      };
      return {
        receive(message: TextCommand<Start>) {
          if (disconnected || message.type === 'keepalive') return;
          if (message.type === 'cancel') {
            if (message.requestId === activeId) job?.cancel();
            return;
          }
          if (started || reservations > 0) {
            emit(adapter.failure(message, 'invalid-request'));
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
          }, adapter.timeoutMs);
          const finish = (result: Server) => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            emit(result);
          };
          const current: TextJob = {
            flight: Promise.resolve(),
            cancel() {
              controller.abort();
              finish(
                adapter.failure(
                  message,
                  timedOut ? 'timeout' : 'cancelled',
                  timedOut ? 'timeout' : undefined
                )
              );
            },
          };
          job = current;
          jobs.add(current);
          emit(adapter.progress(message));
          current.flight = adapter
            .run(message, sender, controller.signal, emit)
            .then((result) => {
              controller.signal.throwIfAborted();
              finish(adapter.result(message, result));
            })
            .catch((error: unknown) => {
              const code: Failure | LifecycleFailure = controller.signal.aborted
                ? timedOut
                  ? 'timeout'
                  : 'cancelled'
                : (error instanceof Error &&
                    adapter.failureCodes.find((entry) => entry === error.message)) ||
                  'provider-failed';
              finish(
                adapter.failure(
                  message,
                  code,
                  controller.signal.aborted
                    ? timedOut
                      ? 'timeout'
                      : undefined
                    : error instanceof AIProviderRequestError
                      ? error.reason
                      : undefined
                )
              );
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
