import type { ExplicitMotionSignal } from './document-signals';

const MOTION_BUDGET_MS = 2000;
export const HOST_LAYOUT_GEOMETRY_TOLERANCE_PX = 0.5;

export type HostLayoutStabilitySample = ReadonlyArray<{
  key: string;
  values: readonly number[];
}>;

function areSamplesStable(current: HostLayoutStabilitySample, previous: HostLayoutStabilitySample) {
  if (current.length !== previous.length) return false;
  return current.every((entry, index) => {
    const previousEntry = previous[index];
    return (
      previousEntry?.key === entry.key &&
      previousEntry.values.length === entry.values.length &&
      entry.values.every(
        (value, valueIndex) =>
          Math.abs(value - (previousEntry.values[valueIndex] ?? Number.POSITIVE_INFINITY)) <=
          HOST_LAYOUT_GEOMETRY_TOLERANCE_PX
      )
    );
  });
}

export function createHostLayoutScheduler(args: {
  advanceMotion(): boolean;
  onMotionSettled(): void;
  onSamplingAbandoned(): void;
  run(): HostLayoutStabilitySample;
}) {
  let primaryFrameId: number | null = null;
  let settlingFrameId: number | null = null;
  let motionRequested = false;
  let episodeStartedAt: number | null = null;
  let episodeTracksMotion = false;
  let previousSample: HostLayoutStabilitySample = [];

  const clearFrame = (id: number | null) => {
    if (id !== null) cancelAnimationFrame(id);
  };

  const clear = () => {
    clearFrame(primaryFrameId);
    clearFrame(settlingFrameId);
    primaryFrameId = null;
    settlingFrameId = null;
    motionRequested = false;
    episodeStartedAt = null;
    episodeTracksMotion = false;
    previousSample = [];
  };

  const finishEpisode = () => {
    episodeStartedAt = null;
    episodeTracksMotion = false;
    previousSample = [];
  };

  const abandonExpiredNonMotionEpisode = (timestamp: number) => {
    if (
      episodeTracksMotion ||
      episodeStartedAt === null ||
      timestamp - episodeStartedAt < MOTION_BUDGET_MS
    ) {
      return false;
    }
    finishEpisode();
    args.onSamplingAbandoned();
    return true;
  };

  const scheduleSettle = () => {
    settlingFrameId = requestAnimationFrame((timestamp) => {
      settlingFrameId = null;
      const hasUncappedMotion = args.advanceMotion();
      if (abandonExpiredNonMotionEpisode(timestamp)) return;
      const sample = args.run();
      if (areSamplesStable(sample, previousSample)) {
        finishEpisode();
        args.onMotionSettled();
        return;
      }
      if (episodeTracksMotion && !hasUncappedMotion) {
        finishEpisode();
        return;
      }
      previousSample = sample;
      scheduleSettle();
    });
  };

  return {
    clear,
    invalidate(options?: { motion?: boolean }) {
      const requestsMotion = options?.motion === true;
      motionRequested ||= requestsMotion;
      if (primaryFrameId !== null) return;
      clearFrame(settlingFrameId);
      settlingFrameId = null;
      primaryFrameId = requestAnimationFrame((timestamp) => {
        primaryFrameId = null;
        episodeStartedAt ??= timestamp;
        episodeTracksMotion ||= motionRequested;
        motionRequested = false;
        const hasUncappedMotion = args.advanceMotion();
        if (abandonExpiredNonMotionEpisode(timestamp)) return;
        previousSample = args.run();
        if (episodeTracksMotion && !hasUncappedMotion) {
          finishEpisode();
          return;
        }
        scheduleSettle();
      });
    },
  };
}

type MotionBinding = { generation: number; node: HTMLElement | null };
type LiveMotionBinding = MotionBinding & { node: HTMLElement };
type MotionClaim = LiveMotionBinding & { claimId: number };
type MotionBudget = LiveMotionBinding & {
  budgetId: number;
  capped: boolean;
  startedAt: number;
};
type ExplicitMotionClaim = MotionClaim &
  Pick<ExplicitMotionSignal, 'family' | 'name' | 'pseudoElement' | 'target'> & { count: number };
type AffectedMotionBinding = { binding: LiveMotionBinding; frameId: string };

type HostLayoutMotionAuthorityArgs = {
  bindings(): Iterable<[string, MotionBinding]>;
  getBinding(frameId: string): MotionBinding | undefined;
  isPresentationRelated(target: Element, node: HTMLElement): boolean;
  now?(): number;
  suspend(bindings: readonly AffectedMotionBinding[]): void;
};

class HostLayoutMotionAuthorityOwner {
  private readonly explicitClaims = new Map<string, ExplicitMotionClaim[]>();
  private readonly transientClaims = new Map<string, MotionClaim>();
  private readonly budgets = new Map<string, MotionBudget>();
  private nextBudgetId = 1;
  private nextClaimId = 1;

  constructor(private readonly args: HostLayoutMotionAuthorityArgs) {}

  beginExplicit = (signal: ExplicitMotionSignal) => {
    const affected = this.findAffected(signal.target);
    if (affected.length === 0) return false;
    let shouldTrack = false;
    affected.forEach(({ binding, frameId }) => {
      let current = (this.explicitClaims.get(frameId) ?? []).filter((claim) =>
        this.isSameBinding(claim, binding)
      );
      const reopenedBudget = this.ensureBudget(frameId, binding);
      if (reopenedBudget) {
        current = [];
        this.transientClaims.delete(frameId);
      }
      const source = current.find((claim) => this.isSameSource(claim, signal));
      if (source) {
        source.count += 1;
        shouldTrack = true;
      } else {
        current.push(this.createExplicitClaim(binding, signal));
        shouldTrack = true;
      }
      this.explicitClaims.set(frameId, current);
    });
    this.args.suspend(affected);
    return shouldTrack;
  };

  beginTransient = (target: EventTarget) => {
    const affected = this.findAffected(target);
    if (affected.length === 0) return false;
    let shouldTrack = false;
    affected.forEach(({ binding, frameId }) => {
      const reopenedBudget = this.ensureBudget(frameId, binding);
      if (reopenedBudget) {
        this.explicitClaims.delete(frameId);
        this.transientClaims.delete(frameId);
      }
      const current = this.transientClaims.get(frameId);
      if (current && this.isSameBinding(current, binding)) {
        shouldTrack = true;
        return;
      }
      this.transientClaims.set(frameId, this.createMotionClaim(binding));
      shouldTrack = true;
    });
    this.args.suspend(affected);
    return shouldTrack;
  };

  clear = () => {
    this.explicitClaims.clear();
    this.transientClaims.clear();
    this.budgets.clear();
  };

  continueExplicit = (signal: ExplicitMotionSignal) => {
    let shouldTrack = false;
    this.findAffected(signal.target).forEach(({ binding, frameId }) => {
      const claim = (this.explicitClaims.get(frameId) ?? []).find(
        (candidate) =>
          this.isSameBinding(candidate, binding) && this.isSameSource(candidate, signal)
      );
      if (!claim) return;
      if (this.ensureBudget(frameId, binding)) {
        claim.claimId = this.takeClaimId();
        claim.count = 1;
        this.explicitClaims.set(frameId, [claim]);
        this.transientClaims.delete(frameId);
      }
      shouldTrack = true;
    });
    return shouldTrack;
  };

  delete = (frameId: string) => {
    this.explicitClaims.delete(frameId);
    this.transientClaims.delete(frameId);
    this.budgets.delete(frameId);
  };

  discardStale = () => {
    let discarded = false;
    this.explicitClaims.forEach((claims, frameId) => {
      const current = claims.filter((claim) => this.isBindingCurrent(frameId, claim));
      if (current.length === claims.length) return;
      if (current.length > 0) this.explicitClaims.set(frameId, current);
      else this.explicitClaims.delete(frameId);
      discarded = true;
    });
    this.transientClaims.forEach((claim, frameId) => {
      if (this.isBindingCurrent(frameId, claim)) return;
      this.transientClaims.delete(frameId);
      discarded = true;
    });
    this.budgets.forEach((budget, frameId) => {
      const hasCurrentClaim = this.getClaims(frameId).some((claim) =>
        this.isSameBinding(claim, budget)
      );
      if (this.isBindingCurrent(frameId, budget) && hasCurrentClaim) return;
      this.budgets.delete(frameId);
      discarded = true;
    });
    return discarded;
  };

  endExplicit = (signal: ExplicitMotionSignal) => {
    let shouldInvalidate = false;
    this.findAffected(signal.target).forEach(({ binding, frameId }) => {
      const current = (this.explicitClaims.get(frameId) ?? []).filter((claim) =>
        this.isSameBinding(claim, binding)
      );
      const sourceIndex = current.findIndex((claim) => this.isSameSource(claim, signal));
      if (sourceIndex < 0) return;
      const source = current[sourceIndex]!;
      const reopenedBudget = this.ensureBudget(frameId, binding);
      if (reopenedBudget) {
        this.explicitClaims.delete(frameId);
        this.transientClaims.set(frameId, this.createMotionClaim(binding));
        shouldInvalidate = true;
        return;
      }
      if (source.count > 1) {
        source.count -= 1;
        this.explicitClaims.set(frameId, current);
        return;
      }
      current.splice(sourceIndex, 1);
      if (current.length > 0) {
        this.explicitClaims.set(frameId, current);
        return;
      }
      this.explicitClaims.delete(frameId);
      this.transientClaims.set(frameId, this.createMotionClaim(binding));
      shouldInvalidate = true;
    });
    return shouldInvalidate;
  };

  advanceBudgets = () => {
    const now = this.now();
    const newlyFullyCapped = new Map<string, number>();
    this.budgets.forEach((budget, frameId) => {
      if (this.getClaimsForBinding(frameId, budget).length === 0) {
        this.budgets.delete(frameId);
        return;
      }
      if (budget.capped || now - budget.startedAt < MOTION_BUDGET_MS) return;
      budget.capped = true;
      newlyFullyCapped.set(frameId, budget.generation);
    });
    return newlyFullyCapped;
  };

  hasUncappedClaims = () =>
    Array.from(this.budgets.entries()).some(
      ([frameId, budget]) => !budget.capped && this.getClaimsForBinding(frameId, budget).length > 0
    );

  getFullyCappedGenerations = () => {
    const generations = new Map<string, number>();
    this.budgets.forEach((budget, frameId) => {
      if (budget.capped && this.getClaimsForBinding(frameId, budget).length > 0) {
        generations.set(frameId, budget.generation);
      }
    });
    return generations;
  };

  getMovingGenerations = () => {
    this.discardStale();
    const generations = new Map<string, number>();
    this.explicitClaims.forEach((claims, frameId) => {
      const claim = claims[0];
      if (claim) generations.set(frameId, claim.generation);
    });
    this.transientClaims.forEach((claim, frameId) => generations.set(frameId, claim.generation));
    return generations;
  };

  getStabilityTokens = () => {
    const tokens = new Map<string, string>();
    this.budgets.forEach((budget, frameId) => {
      if (budget.capped) return;
      const claimIds = this.getClaimsForBinding(frameId, budget)
        .map((claim) => claim.claimId)
        .sort((left, right) => left - right);
      if (claimIds.length > 0) {
        tokens.set(frameId, `${budget.budgetId}:${claimIds.join(',')}`);
      }
    });
    return tokens;
  };

  settleTransient = () => {
    let settled = false;
    this.transientClaims.forEach((claim, frameId) => {
      const budget = this.getBudget(frameId, claim);
      if (budget?.capped) return;
      this.transientClaims.delete(frameId);
      const explicit = (this.explicitClaims.get(frameId) ?? []).filter((candidate) =>
        this.isSameBinding(candidate, claim)
      );
      if (explicit.length > 0) this.explicitClaims.set(frameId, explicit);
      else {
        this.explicitClaims.delete(frameId);
        if (budget) this.budgets.delete(frameId);
      }
      settled = true;
    });
    return settled;
  };

  private createExplicitClaim(
    binding: LiveMotionBinding,
    signal: ExplicitMotionSignal
  ): ExplicitMotionClaim {
    return { ...this.createMotionClaim(binding), ...signal, count: 1 };
  }

  private createMotionClaim(binding: LiveMotionBinding): MotionClaim {
    return {
      ...binding,
      claimId: this.takeClaimId(),
    };
  }

  private createMotionBudget(binding: LiveMotionBinding): MotionBudget {
    return {
      ...binding,
      budgetId: this.takeBudgetId(),
      capped: false,
      startedAt: this.now(),
    };
  }

  private ensureBudget(frameId: string, binding: LiveMotionBinding): boolean {
    const current = this.budgets.get(frameId);
    if (!current || !this.isSameBinding(current, binding)) {
      this.budgets.set(frameId, this.createMotionBudget(binding));
      return false;
    }
    if (!current.capped && this.now() - current.startedAt < MOTION_BUDGET_MS) return false;
    current.budgetId = this.takeBudgetId();
    current.capped = false;
    current.startedAt = this.now();
    return true;
  }

  private findAffected(target: EventTarget): AffectedMotionBinding[] {
    if (!('nodeType' in target) || target.nodeType !== 1) return [];
    return Array.from(this.args.bindings()).flatMap(([frameId, binding]) => {
      const node = binding.node;
      if (!node || !this.args.isPresentationRelated(target as Element, node)) return [];
      return [{ binding: binding as LiveMotionBinding, frameId }];
    });
  }

  private getClaims(frameId: string): MotionClaim[] {
    const transient = this.transientClaims.get(frameId);
    return [...(this.explicitClaims.get(frameId) ?? []), ...(transient ? [transient] : [])];
  }

  private getClaimsForBinding(frameId: string, binding: MotionBinding): MotionClaim[] {
    return this.getClaims(frameId).filter((claim) => this.isSameBinding(claim, binding));
  }

  private getBudget(frameId: string, binding: MotionBinding): MotionBudget | undefined {
    const budget = this.budgets.get(frameId);
    return budget && this.isSameBinding(budget, binding) ? budget : undefined;
  }

  private isBindingCurrent(frameId: string, claim: MotionBinding): boolean {
    const binding = this.args.getBinding(frameId);
    return Boolean(binding?.node && this.isSameBinding(binding, claim));
  }

  private isSameBinding(left: MotionBinding, right: MotionBinding): boolean {
    return left.generation === right.generation && left.node === right.node;
  }

  private isSameSource(claim: ExplicitMotionClaim, signal: ExplicitMotionSignal): boolean {
    return (
      claim.target === signal.target &&
      claim.family === signal.family &&
      claim.name === signal.name &&
      claim.pseudoElement === signal.pseudoElement
    );
  }

  private now() {
    return this.args.now?.() ?? performance.now();
  }

  private takeBudgetId() {
    const budgetId = this.nextBudgetId;
    this.nextBudgetId += 1;
    return budgetId;
  }

  private takeClaimId() {
    const claimId = this.nextClaimId;
    this.nextClaimId += 1;
    return claimId;
  }
}

export function createHostLayoutMotionAuthority(args: HostLayoutMotionAuthorityArgs) {
  return new HostLayoutMotionAuthorityOwner(args);
}
