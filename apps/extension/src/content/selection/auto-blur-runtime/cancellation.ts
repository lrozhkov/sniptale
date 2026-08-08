export function createAutoBlurScanAbortError(): DOMException {
  return new DOMException('Auto-blur scan was cancelled.', 'AbortError');
}

export function throwIfAutoBlurScanAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw createAutoBlurScanAbortError();
}

export function isAutoBlurScanAbortError(error: unknown): boolean {
  return (
    (typeof DOMException !== 'undefined' &&
      error instanceof DOMException &&
      error.name === 'AbortError') ||
    (error instanceof Error && error.name === 'AbortError')
  );
}
