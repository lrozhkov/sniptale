// policyStateId: video-capture-surface-sessions - this gate binds source readiness to one active recording generation.
type StartBinding = {
  generation: number;
  recordingId: string;
  streamInstanceId: string;
};
const RECORDING_BEGIN_TIMEOUT_MS = 10_000;

let pending:
  | (StartBinding & {
      reject: (reason: unknown) => void;
      resolve: () => void;
      timeout: ReturnType<typeof setTimeout>;
    })
  | null = null;

export function waitForRecordingBegin(binding: StartBinding, activationDelayMs = 0): Promise<void> {
  if (pending) return Promise.reject(new Error('Another recording start gate is active'));
  const boundedActivationDelay =
    Number.isFinite(activationDelayMs) && activationDelayMs > 0 ? activationDelayMs : 0;
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      pending = null;
      reject(new Error('Timed out while waiting for recording activation'));
    }, RECORDING_BEGIN_TIMEOUT_MS + boundedActivationDelay);
    pending = { ...binding, reject, resolve, timeout };
  });
}

export function allowRecordingBegin(binding: StartBinding): void {
  if (
    !pending ||
    pending.recordingId !== binding.recordingId ||
    pending.generation !== binding.generation ||
    pending.streamInstanceId !== binding.streamInstanceId
  ) {
    throw new Error('Stale or mismatched recording start binding');
  }
  const resolve = pending.resolve;
  clearTimeout(pending.timeout);
  pending = null;
  resolve();
}

export function cancelRecordingBegin(reason = 'Recording start was cancelled'): void {
  const reject = pending?.reject;
  if (pending) clearTimeout(pending.timeout);
  pending = null;
  reject?.(new Error(reason));
}
