export interface NativeSettingsSyncTracker {
  acceptRevision(revision: string): boolean;
  invalidate(): void;
  isCurrent(sequence: number): boolean;
  nextSequence(): number;
  setPendingRevision(revision: string): void;
}

export function createNativeSettingsSyncTracker(): NativeSettingsSyncTracker {
  let pendingRevision: string | null = null;
  let sequence = 0;

  return {
    acceptRevision(revision) {
      if (revision !== pendingRevision) {
        return false;
      }
      pendingRevision = null;
      return true;
    },
    invalidate() {
      pendingRevision = null;
      sequence += 1;
    },
    isCurrent(candidate) {
      return candidate === sequence;
    },
    nextSequence() {
      sequence += 1;
      return sequence;
    },
    setPendingRevision(revision) {
      pendingRevision = revision;
    },
  };
}
