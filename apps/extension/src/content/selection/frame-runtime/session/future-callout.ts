import type { CalloutSettings } from '@sniptale/runtime-contracts/highlighter/callout';

let futureFrameCallout: CalloutSettings | null = null;

export function getFutureFrameCallout(): CalloutSettings | null {
  return futureFrameCallout === null ? null : structuredClone(futureFrameCallout);
}

export function setFutureFrameCallout(settings: CalloutSettings | null): void {
  futureFrameCallout = settings === null ? null : structuredClone(settings);
}
