import type { AIConnectionReason } from '../../contracts/settings/ai-catalog';
import { browserRuntime } from '@sniptale/platform/browser/runtime';
import { cancelReviewRemoteJob, keepReviewRemoteJobAlive } from '../audio-jobs/remote-job-port';

/** Carries an admitted provider category while preserving the existing text-job code. */
export class TextJobProviderError extends Error {
  constructor(
    readonly reason: AIConnectionReason,
    code: string
  ) {
    super(code);
    this.name = 'TextJobProviderError';
  }
}

type TextReply = { requestId: string } & (
  | { type: 'failure'; code: string; failureReason?: AIConnectionReason | undefined }
  | { type: 'progress' }
  | { type: 'result' | 'proposal' }
);

interface TextRequestAdapter<Start, Server, Result> {
  name: string;
  start: Start;
  signal: AbortSignal;
  timeoutMs: number;
  keepaliveMs: number;
  cancelMessage: string;
  parse(value: unknown): Server | null;
  readResult(message: Server): Result | null;
}

/** Runs one parsed text request and owns its Port cleanup without retrying a paid call. */
export function runTextRequestPort<
  Start extends { requestId: string },
  Server extends TextReply,
  Result,
>(adapter: TextRequestAdapter<Start, Server, Result>): Promise<Result> {
  const { signal, start } = adapter;
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const port = browserRuntime.connect({ name: adapter.name });
    let finished = false;
    const finish = (result?: Result, error?: Error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      clearInterval(keepalive);
      signal.removeEventListener('abort', cancel);
      port.onMessage.removeListener(onMessage);
      port.onDisconnect.removeListener(onDisconnect);
      port.disconnect();
      if (result !== undefined) resolve(result);
      else reject(error ?? new Error('interrupted'));
    };
    const cancel = () =>
      cancelReviewRemoteJob(port, start.requestId, (result) =>
        finish(result, new DOMException(adapter.cancelMessage, 'AbortError'))
      );
    const onDisconnect = () => {
      void browserRuntime.getLastError();
      finish();
    };
    const onMessage = (value: unknown) => {
      const message = adapter.parse(value);
      if (!message) {
        finish(undefined, new Error('invalid-response'));
        return;
      }
      if (message.requestId !== start.requestId) return;
      if (message.type === 'failure') {
        finish(
          undefined,
          message.failureReason === undefined
            ? new Error(message.code)
            : new TextJobProviderError(message.failureReason, message.code)
        );
        return;
      }
      if (message.type === 'progress') return;
      const result = adapter.readResult(message);
      if (result === null) finish(undefined, new Error('invalid-response'));
      else finish(result);
    };
    const timer = setTimeout(
      () => finish(undefined, new TextJobProviderError('timeout', 'timeout')),
      adapter.timeoutMs
    );
    const keepalive = setInterval(() => {
      keepReviewRemoteJobAlive(port, start.requestId, finish);
    }, adapter.keepaliveMs);
    port.onMessage.addListener(onMessage);
    port.onDisconnect.addListener(onDisconnect);
    signal.addEventListener('abort', cancel, { once: true });
    if (signal.aborted) {
      cancel();
      return;
    }
    try {
      port.postMessage(start);
    } catch {
      finish(undefined, new Error('interrupted'));
    }
  });
}
