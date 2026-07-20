import { runtimeInfo } from '@sniptale/platform/browser/runtime';

export function keepServiceWorkerAlive(): () => void {
  const keepAliveInterval = setInterval(() => {
    void runtimeInfo.getPlatformInfo().catch(() => {
      // Пустой колбэк — нужен только для keepalive
    });
  }, 20000);

  return () => clearInterval(keepAliveInterval);
}

export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operation: string
): Promise<T> {
  return new Promise((resolve, reject) => {
    const stopKeepAlive = keepServiceWorkerAlive();
    let completed = false;

    const timeoutId = setTimeout(() => {
      if (!completed) {
        completed = true;
        stopKeepAlive();
        reject(new Error(`Timeout (${timeoutMs}ms) during ${operation}`));
      }
    }, timeoutMs);

    promise
      .then((result) => {
        if (!completed) {
          completed = true;
          clearTimeout(timeoutId);
          stopKeepAlive();
          resolve(result);
        }
      })
      .catch((error) => {
        if (!completed) {
          completed = true;
          clearTimeout(timeoutId);
          stopKeepAlive();
          reject(error);
        }
      });
  });
}
