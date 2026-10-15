type JobPort = { postMessage(message: { type: 'cancel' | 'keepalive'; requestId: string }): void };
export function cancelReviewRemoteJob(
  port: JobPort,
  requestId: string,
  finish: (result: undefined, error: Error) => void
): void {
  try {
    port.postMessage({ type: 'cancel', requestId });
  } catch {
    /* disconnected */
  }
  finish(undefined, new DOMException('Cancelled', 'AbortError'));
}
export function keepReviewRemoteJobAlive(
  port: JobPort,
  requestId: string,
  finish: (result: undefined, error: Error) => void
): void {
  try {
    port.postMessage({ type: 'keepalive', requestId });
  } catch {
    finish(undefined, new Error('interrupted'));
  }
}
