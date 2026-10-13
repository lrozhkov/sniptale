// policyStateId: video-capture-surface-sessions - one gate binds preparation and activation to a recording generation.
type StartBinding = { generation: number; recordingId: string; streamInstanceId: string };
type Gate = StartBinding & {
  promise: Promise<void>;
  reject: (reason: unknown) => void;
  resolve: () => void;
  timeout: ReturnType<typeof setTimeout>;
  reserved: boolean;
  consumed: boolean;
  allowed: boolean;
};
const RECORDING_BEGIN_TIMEOUT_MS = 10_000;
let pending: Gate | null = null;

function matches(left: StartBinding, right: StartBinding): boolean {
  return (
    left.recordingId === right.recordingId &&
    left.generation === right.generation &&
    left.streamInstanceId === right.streamInstanceId
  );
}

function createGate(binding: StartBinding, delayMs: number, reserved: boolean): Gate {
  let resolve!: () => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  void promise.catch(() => undefined);
  const gate: Gate = {
    ...binding,
    promise,
    resolve,
    reject,
    reserved,
    consumed: !reserved,
    allowed: false,
    timeout: setTimeout(() => {
      if (pending === gate && !gate.reserved) pending = null;
      reject(new Error('Timed out while waiting for recording activation'));
    }, delayMs),
  };
  pending = gate;
  return gate;
}

/** Reserve activation authority before data preparation; an early BEGIN is retained for this binding only. */
export function reserveRecordingBegin(binding: StartBinding, timeoutMs: number): Promise<void> {
  if (pending) throw new Error('Another recording start gate is active');
  return createGate(binding, timeoutMs, true).promise;
}

export function waitForRecordingBegin(binding: StartBinding, activationDelayMs = 0): Promise<void> {
  if (pending) {
    if (pending.reserved && !pending.consumed && matches(pending, binding)) {
      const gate = pending;
      gate.consumed = true;
      if (gate.allowed) pending = null;
      return gate.promise;
    }
    return Promise.reject(new Error('Another recording start gate is active'));
  }
  const delay = Number.isFinite(activationDelayMs) && activationDelayMs > 0 ? activationDelayMs : 0;
  return createGate(binding, RECORDING_BEGIN_TIMEOUT_MS + delay, false).promise;
}

export function assertRecordingBegin(binding: StartBinding): void {
  if (!pending || pending.allowed || !matches(pending, binding))
    throw new Error('Stale or mismatched recording start binding');
}

export function allowRecordingBegin(binding: StartBinding): void {
  assertRecordingBegin(binding);
  if (!pending) return;
  const gate = pending;
  gate.allowed = true;
  clearTimeout(gate.timeout);
  if (gate.consumed) pending = null;
  gate.resolve();
}

export function cancelRecordingBegin(reason = 'Recording start was cancelled'): void {
  if (!pending) return;
  const gate = pending;
  pending = null;
  clearTimeout(gate.timeout);
  gate.reject(new Error(reason));
}
