interface BrowserEventSource<Args extends unknown[]> {
  addListener(listener: (...args: Args) => void): void;
  removeListener(listener: (...args: Args) => void): void;
}

const CHROME_RUNTIME_ERROR_FALLBACK_MESSAGE = 'Chrome runtime error';

function isPromiseLike<T>(value: unknown): value is Promise<T> {
  return typeof value === 'object' && value !== null && 'then' in value;
}

function getChromeRuntimeErrorMessage(error: chrome.runtime.LastError): string {
  return typeof error.message === 'string' && error.message.length > 0
    ? error.message
    : CHROME_RUNTIME_ERROR_FALLBACK_MESSAGE;
}

export function normalizeChromeRuntimeError(error: chrome.runtime.LastError): Error {
  return new Error(getChromeRuntimeErrorMessage(error), { cause: error });
}

/**
 * Wraps callback-based Chrome APIs into a Promise that respects `runtime.lastError`.
 */
export function runChromeCallback<T>(
  register: (callback: (value: T) => void) => void | Promise<T>,
  unavailableMessage: string
): Promise<T> {
  if (typeof chrome === 'undefined') {
    return Promise.reject(new Error(unavailableMessage));
  }

  return new Promise<T>((resolve, reject) => {
    let settled = false;

    const resolveOnce = (value: T) => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };

    const rejectOnce = (error: unknown) => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    };

    try {
      const maybePromise = register((value) => {
        const lastError = chrome.runtime?.lastError;
        if (lastError) {
          rejectOnce(normalizeChromeRuntimeError(lastError));
          return;
        }

        resolveOnce(value);
      });

      if (isPromiseLike<T>(maybePromise)) {
        maybePromise.then(resolveOnce).catch(rejectOnce);
      }
    } catch (error) {
      rejectOnce(error);
    }
  });
}

/**
 * Wraps callback-based Chrome APIs that only report completion.
 */
export function runChromeVoidCallback(
  register: (callback: () => void) => void | Promise<void>,
  unavailableMessage: string
): Promise<void> {
  return runChromeCallback<void>((callback) => register(() => callback()), unavailableMessage);
}

/**
 * Subscribes to a Chrome listener source and returns a deterministic unsubscribe handle.
 */
export function subscribeToChromeEvent<Args extends unknown[]>(
  source: BrowserEventSource<Args> | undefined,
  listener: (...args: Args) => void
): () => void {
  if (!source) {
    return () => {};
  }

  source.addListener(listener);
  return () => {
    source.removeListener(listener);
  };
}
