import type { browserRuntime } from '@sniptale/platform/browser/runtime';

type RuntimeListener = Parameters<typeof browserRuntime.subscribeToMessages>[0];
type MessageSubscription = typeof browserRuntime.subscribeToMessages;

export function runRequestWorkflow<TResult>(props: {
  createListener: (finish: (result: TResult) => void) => RuntimeListener;
  onRequestError: (error: unknown, finish: (result: TResult) => void) => void;
  onTimeout: (finish: (result: TResult) => void) => void;
  request: () => Promise<unknown>;
  subscribeToMessages: MessageSubscription;
  timeoutMs: number;
}): Promise<TResult> {
  return new Promise((resolve) => {
    let settled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let unsubscribe: () => void = () => undefined;

    const finish = (result: TResult) => {
      if (settled) {
        return;
      }

      settled = true;
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
      unsubscribe();
      resolve(result);
    };

    timeoutId = setTimeout(() => {
      props.onTimeout(finish);
    }, props.timeoutMs);

    unsubscribe = props.subscribeToMessages(props.createListener(finish));

    if (settled) {
      unsubscribe();
      return;
    }

    props.request().catch((error) => {
      props.onRequestError(error, finish);
    });
  });
}
