import { writeCaptureSurfaceJournal } from '../storage/capture-surface';
import type {
  CaptureSurfaceJournalEntry,
  CaptureSurfaceOwner,
} from '../storage/capture-surface/contracts';
import type {
  AppliedCaptureSurface,
  AppliedCaptureSurfaceBinding,
  CaptureSurfaceLeaseState,
} from './types';
import { CaptureSurfaceError } from './types';

export class CaptureSurfaceLeaseRegistry {
  private readonly leasesById = new Map<string, CaptureSurfaceLeaseState>();
  private readonly stackByTab = new Map<number, CaptureSurfaceLeaseState[]>();
  private readonly generationBySession = new Map<string, number>();
  private revision = 0;

  values(): IterableIterator<CaptureSurfaceLeaseState> {
    return this.leasesById.values();
  }

  stacks(): IterableIterator<CaptureSurfaceLeaseState[]> {
    return this.stackByTab.values();
  }

  getLease(leaseId: string): CaptureSurfaceLeaseState | undefined {
    return this.leasesById.get(leaseId);
  }

  getStack(tabId: number): CaptureSurfaceLeaseState[] | undefined {
    return this.stackByTab.get(tabId);
  }

  getOrCreateStack(tabId: number): CaptureSurfaceLeaseState[] {
    return this.stackByTab.get(tabId) ?? [];
  }

  getApplied(tabId: number): AppliedCaptureSurface | null {
    const state = this.stackByTab.get(tabId)?.at(-1);
    return state?.entry.phase === 'applied' ? state.applied : null;
  }

  getAppliedForSession(sessionId: string): AppliedCaptureSurface | null {
    return this.getAppliedBindingForSession(sessionId)?.applied ?? null;
  }

  getAppliedBindingForSession(sessionId: string): AppliedCaptureSurfaceBinding | null {
    const state = [...this.leasesById.values()].find(
      (candidate) =>
        candidate.applied.sessionId === sessionId && candidate.entry.phase === 'applied'
    );
    return state ? { applied: state.applied, tabId: state.entry.tabId } : null;
  }

  hasOwnerLease(owner: CaptureSurfaceOwner): boolean {
    return [...this.leasesById.values()].some((state) => state.entry.owner === owner);
  }

  hasSessionLease(sessionId: string): boolean {
    return [...this.leasesById.values()].some((state) => state.entry.sessionId === sessionId);
  }

  assertNextGeneration(sessionId: string, generation: number): void {
    const previousGeneration = this.generationBySession.get(sessionId) ?? -1;
    if (!Number.isInteger(generation) || generation <= previousGeneration) {
      throw new CaptureSurfaceError('stale-generation');
    }
  }

  recordGeneration(sessionId: string, generation: number): void {
    this.generationBySession.set(sessionId, generation);
  }

  nextTimestamp(): number {
    if (this.revision >= Number.MAX_SAFE_INTEGER) {
      throw new Error('Capture surface journal revision is exhausted');
    }
    this.revision += 1;
    return this.revision;
  }

  add(
    state: CaptureSurfaceLeaseState,
    parent: CaptureSurfaceLeaseState | null,
    stack: CaptureSurfaceLeaseState[]
  ): void {
    if (parent) parent.entry.phase = 'suspended';
    stack.push(state);
    this.stackByTab.set(state.entry.tabId, stack);
    this.leasesById.set(state.applied.leaseId, state);
  }

  remove(state: CaptureSurfaceLeaseState): void {
    this.leasesById.delete(state.applied.leaseId);
    const stack = this.stackByTab.get(state.entry.tabId);
    if (!stack) return;
    const index = stack.indexOf(state);
    if (index >= 0) stack.splice(index, 1);
    if (stack.length === 0) this.stackByTab.delete(state.entry.tabId);
  }

  collapseReplacedParent(
    replacement: CaptureSurfaceLeaseState,
    parent: CaptureSurfaceLeaseState
  ): void {
    replacement.prior = parent.prior;
    replacement.entry.prior = parent.prior;
    replacement.entry.parentLeaseId = parent.entry.parentLeaseId;
    replacement.viewportAcquisitionOwned ||= parent.viewportAcquisitionOwned;
    this.remove(parent);
  }

  collapseCrossTargetReplacedParent(
    replacement: CaptureSurfaceLeaseState,
    parent: CaptureSurfaceLeaseState
  ): void {
    const grandparent = parent.entry.parentLeaseId
      ? this.leasesById.get(parent.entry.parentLeaseId)
      : undefined;
    if (grandparent?.applied.target === replacement.applied.target) {
      replacement.prior = grandparent.entry.applied;
      replacement.entry.prior = grandparent.entry.applied;
      if (
        replacement.applied.target === 'viewport' &&
        replacement.viewportAcquisitionOwned &&
        (grandparent.entry.owner === 'video') === (replacement.entry.owner === 'video')
      ) {
        grandparent.viewportAcquisitionOwned = true;
        replacement.viewportAcquisitionOwned = false;
      }
    }
    replacement.entry.parentLeaseId = parent.entry.parentLeaseId;
    this.remove(parent);
  }

  discardSuspended(state: CaptureSurfaceLeaseState, child: CaptureSurfaceLeaseState): void {
    if (state.applied.target === child.applied.target) {
      child.prior = state.prior;
      child.entry.prior = state.prior;
    }
    child.entry.parentLeaseId = state.entry.parentLeaseId;
    this.remove(state);
  }

  async persistDiscardedSuspended(
    state: CaptureSurfaceLeaseState,
    child: CaptureSurfaceLeaseState
  ): Promise<void> {
    const childEntry: CaptureSurfaceJournalEntry = {
      ...child.entry,
      parentLeaseId: state.entry.parentLeaseId,
      prior: state.applied.target === child.applied.target ? state.prior : child.prior,
    };
    const entries = [...this.leasesById.values()]
      .filter((candidate) => candidate !== state && candidate !== child)
      .map((candidate) => candidate.entry)
      .concat(childEntry)
      .sort((left, right) => left.updatedAt - right.updatedAt);
    await writeCaptureSurfaceJournal(entries);
  }

  async persistReplacement(
    replacement: CaptureSurfaceLeaseState,
    parent: CaptureSurfaceLeaseState
  ): Promise<void> {
    const replacementEntry: CaptureSurfaceJournalEntry = {
      ...replacement.entry,
      parentLeaseId: parent.entry.parentLeaseId,
      prior: parent.prior,
    };
    const entries = [...this.leasesById.values()]
      .filter((state) => state !== parent && state !== replacement)
      .map((state) => state.entry)
      .concat(replacementEntry)
      .sort((left, right) => left.updatedAt - right.updatedAt);
    await writeCaptureSurfaceJournal(entries);
  }

  async persistCrossTargetReplacement(
    replacement: CaptureSurfaceLeaseState,
    parent: CaptureSurfaceLeaseState
  ): Promise<void> {
    const grandparent = parent.entry.parentLeaseId
      ? this.leasesById.get(parent.entry.parentLeaseId)
      : undefined;
    const prior =
      grandparent?.applied.target === replacement.applied.target
        ? grandparent.entry.applied
        : replacement.prior;
    const replacementEntry: CaptureSurfaceJournalEntry = {
      ...replacement.entry,
      parentLeaseId: parent.entry.parentLeaseId,
      prior,
    };
    const entries = [...this.leasesById.values()]
      .filter((state) => state !== parent && state !== replacement)
      .map((state) => state.entry)
      .concat(replacementEntry)
      .sort((left, right) => left.updatedAt - right.updatedAt);
    await writeCaptureSurfaceJournal(entries);
  }

  findViewportCapacity(tabId: number): { width: number; height: number } | null {
    const rootViewportLease = this.stackByTab
      .get(tabId)
      ?.find((lease) => lease.applied.target === 'viewport');
    return rootViewportLease?.prior.type === 'native'
      ? { width: rootViewportLease.prior.width, height: rootViewportLease.prior.height }
      : null;
  }

  clear(): void {
    this.leasesById.clear();
    this.stackByTab.clear();
  }

  hydrate(entry: CaptureSurfaceJournalEntry): CaptureSurfaceLeaseState {
    this.revision = Math.max(this.revision, entry.updatedAt);
    const applied: AppliedCaptureSurface = {
      sessionId: entry.sessionId,
      leaseId: entry.leaseId,
      generation: entry.generation,
      presetId: entry.presetId,
      target: entry.target,
      width: entry.applied.width,
      height: entry.applied.height,
    };
    const state: CaptureSurfaceLeaseState = {
      applied,
      entry: { ...entry },
      prior: entry.prior,
      viewportAcquisitionOwned: false,
    };
    this.leasesById.set(entry.leaseId, state);
    const stack = this.stackByTab.get(entry.tabId) ?? [];
    stack.push(state);
    this.stackByTab.set(entry.tabId, stack);
    this.generationBySession.set(
      entry.sessionId,
      Math.max(this.generationBySession.get(entry.sessionId) ?? -1, entry.generation)
    );
    return state;
  }

  async persist(): Promise<void> {
    const entries = [...this.leasesById.values()]
      .map((state) => state.entry)
      .sort((left, right) => left.updatedAt - right.updatedAt);
    await writeCaptureSurfaceJournal(entries);
  }
}
