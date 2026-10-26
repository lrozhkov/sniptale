import { browserRuntime } from '@sniptale/platform/browser/runtime';
import {
  CONTENT_TEXT_PORT_NAME,
  CONTENT_TEXT_TIMEOUT_MS,
  CONTENT_TEXT_KEEPALIVE_MS,
  parseContentTextServerMessage,
  type ContentTextStart,
} from '../../contracts/ai/content-text';

/** Runs one explicit content request. Abort and interruption cannot resume the request. */
export function runContentTextJob(start: ContentTextStart, signal: AbortSignal): Promise<string> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const port = browserRuntime.connect({ name: CONTENT_TEXT_PORT_NAME });
    let finished = false;
    const finish = (text?: string, error?: Error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      clearInterval(keepalive);
      signal.removeEventListener('abort', cancel);
      port.onMessage.removeListener(onMessage);
      port.onDisconnect.removeListener(onDisconnect);
      port.disconnect();
      if (text !== undefined) resolve(text);
      else reject(error ?? new Error('interrupted'));
    };
    const cancel = () => {
      try {
        port.postMessage({ type: 'cancel', requestId: start.requestId });
      } catch {
        /* Disconnection also cancels the background flight. */
      }
      finish(undefined, new DOMException('Request cancelled', 'AbortError'));
    };
    const onDisconnect = () => {
      void browserRuntime.getLastError();
      finish();
    };
    const onMessage = (value: unknown) => {
      const message = parseContentTextServerMessage(value);
      if (!message) {
        finish(undefined, new Error('invalid-response'));
        return;
      }
      if (message.requestId !== start.requestId) return;
      if (message.type === 'failure') finish(undefined, new Error(message.code));
      if (message.type === 'result') finish(message.text);
    };
    const timer = setTimeout(
      () => finish(undefined, new Error('timeout')),
      CONTENT_TEXT_TIMEOUT_MS
    );
    const keepalive = setInterval(() => {
      try {
        port.postMessage({ type: 'keepalive', requestId: start.requestId });
      } catch {
        finish(undefined, new Error('interrupted'));
      }
    }, CONTENT_TEXT_KEEPALIVE_MS);
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
