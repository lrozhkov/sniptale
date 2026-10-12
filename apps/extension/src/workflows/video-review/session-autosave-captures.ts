import type { AutosaveCapture, AutosaveKey, ReviewSessionState } from './session-types';

type Producer = { capture: () => AutosaveCapture; pending: boolean };

/** Page-owned lazy producer registrations and ACK identity; no scheduling or durable authority. */
export function createReviewAutosaveCaptures() {
  const producers = new Map<AutosaveKey, Producer>();
  const acquired = new WeakMap<AutosaveCapture, { key: AutosaveKey; producer: Producer }>();
  let published:
    | { state: ReviewSessionState; dirty: boolean; view: ReviewSessionState }
    | undefined;
  return {
    register(key: AutosaveKey, capture: () => AutosaveCapture) {
      // Registration identity is never reused, including after cancel or reload.
      producers.set(key, { capture, pending: true });
    },
    capture(key: AutosaveKey): AutosaveCapture {
      const producer = producers.get(key);
      if (!producer) throw new Error('Review autosave buffer is unavailable.');
      const captured = producer.capture();
      acquired.set(captured, { key, producer });
      return captured;
    },
    acknowledge(captured: AutosaveCapture) {
      const admitted = acquired.get(captured);
      captured.acknowledge();
      if (admitted && producers.get(admitted.key) === admitted.producer)
        admitted.producer.pending = false;
    },
    cancel: (key: AutosaveKey) => producers.delete(key),
    keys: () => producers.keys(),
    clear: () => producers.clear(),
    invalidate() {
      // Reload may fail: invalidate old ACKs while retaining the authored warning.
      for (const [key, producer] of producers) producers.set(key, { ...producer });
    },
    snapshot(state: ReviewSessionState): ReviewSessionState {
      const dirty =
        state.dirty ||
        [...producers].some(([key, producer]) => key !== 'advanced' && producer.pending);
      if (published?.state === state && published.dirty === dirty) return published.view;
      const view = dirty === state.dirty ? state : { ...state, dirty };
      // This cache is an observable UI projection of owned state, never raw storage admission.
      published = { state, dirty, view };
      return view;
    },
  };
}
