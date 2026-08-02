export function withTimeout<TValue>(work: Promise<TValue>, timeoutMs: number): Promise<TValue> {
  return new Promise((resolve, reject) => {
    const timeoutId = globalThis.setTimeout(
      () => reject(new Error('voice-input-timeout')),
      timeoutMs
    );
    void work.then(
      (value) => {
        globalThis.clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        globalThis.clearTimeout(timeoutId);
        reject(error);
      }
    );
  });
}
