import { cancelReviewRemoteJob, keepReviewRemoteJobAlive } from '../audio-jobs/remote-job-port';
import { browserRuntime } from '@sniptale/platform/browser/runtime';
import {
  REVIEW_TEXT_PORT_NAME,
  REVIEW_TEXT_TIMEOUT_MS,
  REVIEW_TEXT_KEEPALIVE_MS,
  parseReviewTextServerMessage,
  parseReviewTextProposal,
  type ReviewTextStart,
  type ReviewTextProposal,
} from '../../contracts/ai/review-text';

/** One explicit request, one connection; interruption never retries a paid call. */
export function runReviewTextJob(
  start: ReviewTextStart,
  signal: AbortSignal
): Promise<ReviewTextProposal> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const port = browserRuntime.connect({ name: REVIEW_TEXT_PORT_NAME });
    let finished = false;
    const finish = (result?: ReviewTextProposal, error?: Error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      clearInterval(keepalive);
      signal.removeEventListener('abort', cancel);
      port.onMessage.removeListener(onMessage);
      port.onDisconnect.removeListener(onDisconnect);
      port.disconnect();
      if (result) resolve(result);
      else reject(error ?? new Error('interrupted'));
    };
    const cancel = () => cancelReviewRemoteJob(port, start.requestId, finish);
    const onDisconnect = () => {
      void browserRuntime.getLastError();
      finish();
    };
    const onMessage = (value: unknown) => {
      const message = parseReviewTextServerMessage(value);
      if (!message) {
        finish(undefined, new Error('invalid-response'));
        return;
      }
      if (message.requestId !== start.requestId) return;
      if (message.type === 'failure') finish(undefined, new Error(message.code));
      if (message.type === 'proposal') {
        const proposal = parseReviewTextProposal(message.proposal, start.context);
        if (proposal) finish(proposal);
        else finish(undefined, new Error('invalid-response'));
      }
    };
    const timer = setTimeout(() => finish(undefined, new Error('timeout')), REVIEW_TEXT_TIMEOUT_MS);
    const keepalive = setInterval(() => {
      keepReviewRemoteJobAlive(port, start.requestId, finish);
    }, REVIEW_TEXT_KEEPALIVE_MS);
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
