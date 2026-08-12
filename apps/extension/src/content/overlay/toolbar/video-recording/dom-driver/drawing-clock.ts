/** Browser clock boundary for disposable recording drawings. */
export type RecordingDrawingClockPort = {
  now(): number;
  setTimeout(callback: () => void, delayMs: number): ReturnType<typeof setTimeout>;
  clearTimeout(handle: ReturnType<typeof setTimeout>): void;
};

export function createRecordingDrawingClockDriver(): RecordingDrawingClockPort {
  return {
    now: () => Date.now(),
    setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
    clearTimeout: (handle) => clearTimeout(handle),
  };
}
