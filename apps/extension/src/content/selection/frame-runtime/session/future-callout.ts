import type { CalloutSettings } from '@sniptale/runtime-contracts/highlighter/callout';

let futureFrameCallout: CalloutSettings | null = null;
let initialized = false;

export function getFutureFrameCallout(): CalloutSettings | null {
  return futureFrameCallout === null ? null : structuredClone(futureFrameCallout);
}

export function setFutureFrameCallout(settings: CalloutSettings | null): void {
  initialized = true;
  futureFrameCallout = settings === null ? null : structuredClone(settings);
}

export function initializeFutureFrameCallout(settings: CalloutSettings | null): void {
  if (initialized) return;
  initialized = true;
  futureFrameCallout = settings === null ? null : structuredClone(settings);
}

export function resetFutureFrameCallout(): void {
  initialized = false;
  futureFrameCallout = null;
}
