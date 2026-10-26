import type { Output } from 'mediabunny';

/** Interrupts encoder backpressure on abort; the render transaction awaits the same cleanup. */
export function ownReviewOutputCancellation(output: Pick<Output, 'cancel'>, signal: AbortSignal) {
  let cancellation: Promise<void> | undefined;
  const cancel = () =>
    (cancellation ??= (async () => {
      await output.cancel();
    })());
  const abort = () => {
    // The transaction reports cleanup failures after its pending operation settles.
    void cancel().catch(() => undefined);
  };
  signal.addEventListener('abort', abort, { once: true });
  if (signal.aborted) abort();
  return {
    cancel,
    dispose: () => signal.removeEventListener('abort', abort),
  };
}
