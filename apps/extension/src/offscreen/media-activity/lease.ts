import type { VoiceInputBusyOwner } from '@sniptale/runtime-contracts/voice-input';

// policyStateId: offscreen-media-activity-lease - this document-local lease is the single
// authority excluding concurrent speech recognition, video capture, and privacy erasure.

type OffscreenMediaActivityOwner = VoiceInputBusyOwner | 'desktop-screenshot';

type ActiveLease = {
  owner: OffscreenMediaActivityOwner;
  token: symbol;
};

let activeLease: ActiveLease | null = null;

export type OffscreenMediaActivityLease = {
  owner: OffscreenMediaActivityOwner;
  release(): void;
};

export function acquireOffscreenMediaActivityLease(owner: OffscreenMediaActivityOwner):
  | { acquired: true; lease: OffscreenMediaActivityLease }
  | {
      acquired: false;
      busyOwner: OffscreenMediaActivityOwner;
    } {
  if (activeLease) return { acquired: false, busyOwner: activeLease.owner };
  const token = Symbol(owner);
  activeLease = { owner, token };
  let released = false;
  return {
    acquired: true,
    lease: {
      owner,
      release() {
        if (released) return;
        released = true;
        if (activeLease?.token === token) activeLease = null;
      },
    },
  };
}

export function inspectOffscreenMediaActivityOwner(): OffscreenMediaActivityOwner | null {
  return activeLease?.owner ?? null;
}

export function resetOffscreenMediaActivityLeaseForTests(): void {
  activeLease = null;
}
