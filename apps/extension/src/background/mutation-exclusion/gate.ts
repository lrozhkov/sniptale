export type MutationPermit = () => void;

export interface MutationExclusionReservation {
  release(): void;
  waitForActiveMutations(): Promise<void>;
}

interface MutationExclusion {
  acquirePermit(): MutationPermit | null;
  reserveExclusion(): MutationExclusionReservation;
}

export function createMutationExclusion(): MutationExclusion {
  let activeMutationCount = 0;
  let pendingExclusionCount = 0;
  let resolveMutationDrain: (() => void) | null = null;
  let mutationDrain = Promise.resolve();

  function acquirePermit(): MutationPermit | null {
    if (pendingExclusionCount > 0) return null;
    if (activeMutationCount === 0) {
      mutationDrain = new Promise<void>((resolve) => {
        resolveMutationDrain = resolve;
      });
    }
    activeMutationCount += 1;
    return createIdempotentRelease(() => {
      activeMutationCount -= 1;
      if (activeMutationCount !== 0) return;
      resolveMutationDrain?.();
      resolveMutationDrain = null;
      mutationDrain = Promise.resolve();
    });
  }

  function reserveExclusion(): MutationExclusionReservation {
    pendingExclusionCount += 1;
    return {
      release: createIdempotentRelease(() => {
        pendingExclusionCount -= 1;
      }),
      waitForActiveMutations() {
        return mutationDrain;
      },
    };
  }

  return { acquirePermit, reserveExclusion };
}

export function createGenerationTrackedMutationExclusion() {
  const exclusion = createMutationExclusion();
  let generation = 0;
  return {
    acquirePermit: exclusion.acquirePermit,
    getGeneration(): number {
      return generation;
    },
    reserveExclusion(): MutationExclusionReservation {
      const reservation = exclusion.reserveExclusion();
      generation += 1;
      return {
        release: createIdempotentRelease(() => {
          reservation.release();
          generation += 1;
        }),
        waitForActiveMutations: reservation.waitForActiveMutations,
      };
    },
  };
}

function createIdempotentRelease(release: () => void): () => void {
  let released = false;
  return () => {
    if (released) return;
    released = true;
    release();
  };
}
