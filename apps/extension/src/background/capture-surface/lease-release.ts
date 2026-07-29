import type { CaptureSurfaceOwner } from '../storage/capture-surface/contracts';
import { releaseViewportSurfaceAcquisition } from './viewport';
import type {
  BeforeCaptureSurfaceOwnerRelease,
  CaptureSurfaceLeaseState,
  CaptureSurfaceReleaseRequest,
} from './types';
import { CaptureSurfaceError } from './types';
import type { CaptureSurfaceLeaseRegistry } from './lease-registry';
import {
  captureSurfaceSnapshotsEqual,
  readCurrentSurfaceSnapshot,
  restoreCaptureSurfaceSnapshot,
  transitionCaptureSurfaceSnapshot,
} from './restoration';

export class CaptureSurfaceLeaseRelease {
  constructor(private readonly registry: CaptureSurfaceLeaseRegistry) {}

  async release(request: CaptureSurfaceReleaseRequest): Promise<void> {
    const state = this.registry.getLease(request.leaseId);
    if (
      !state ||
      state.applied.sessionId !== request.sessionId ||
      state.applied.generation !== request.generation
    ) {
      throw new CaptureSurfaceError('stale-generation');
    }
    const stack = this.registry.getStack(state.entry.tabId);
    if (stack?.at(-1) !== state) throw new CaptureSurfaceError('stale-generation');

    state.entry.phase = 'releasing';
    state.entry.updatedAt = this.registry.nextTimestamp();
    await this.registry.persist();
    const observation = await readCurrentSurfaceSnapshot(state);
    let acquisitionSettled = false;
    try {
      await this.restoreObservedSurface(state, observation.current);
      const parent = stack?.at(-2);
      if (parent && parent.applied.target !== state.applied.target) {
        await this.resumeCrossTargetParent(state, parent);
      }
      acquisitionSettled = await this.transferViewportAcquisition(
        state,
        parent,
        observation.acquired
      );
      await this.releaseOwnedViewportAcquisition(state);
      if (!acquisitionSettled) {
        await observation.releaseAcquisition();
        acquisitionSettled = true;
      }
      this.registry.remove(state);
      const resumedParent = stack?.at(-1);
      if (resumedParent) resumedParent.entry.phase = 'applied';
      await this.registry.persist();
    } finally {
      if (!acquisitionSettled) await observation.releaseAcquisition();
    }
  }

  async releaseOwners(
    owners: ReadonlySet<CaptureSurfaceOwner>,
    beforeRelease?: BeforeCaptureSurfaceOwnerRelease
  ): Promise<void> {
    while ([...this.registry.values()].some((state) => owners.has(state.entry.owner))) {
      const top = [...this.registry.stacks()]
        .map((stack) => stack.at(-1))
        .find((state): state is CaptureSurfaceLeaseState =>
          Boolean(state && owners.has(state.entry.owner))
        );
      if (!top) {
        throw new CaptureSurfaceError(
          'surface-busy',
          'A requested owner lease is suspended beneath another surface'
        );
      }
      await beforeRelease?.({
        generation: top.entry.generation,
        owner: top.entry.owner,
        sessionId: top.entry.sessionId,
        tabId: top.entry.tabId,
        target: top.entry.target,
      });
      await this.release(top.applied);
    }
  }

  async releaseTabOwners(tabId: number, owners: ReadonlySet<CaptureSurfaceOwner>): Promise<void> {
    while (true) {
      const stack = this.registry.getStack(tabId);
      const owned = stack?.filter((state) => owners.has(state.entry.owner)) ?? [];
      if (owned.length === 0) return;
      const top = stack!.at(-1)!;
      if (owners.has(top.entry.owner)) {
        await this.release(top.applied);
        continue;
      }
      const suspended = owned.at(-1)!;
      const index = stack!.indexOf(suspended);
      const child = stack![index + 1];
      if (suspended.entry.phase !== 'suspended' || !child) {
        throw new CaptureSurfaceError(
          'surface-busy',
          'A requested owner lease cannot be safely removed from the active stack'
        );
      }
      await this.releaseOwnedViewportAcquisition(suspended);
      await this.registry.persistDiscardedSuspended(suspended, child);
      this.registry.discardSuspended(suspended, child);
    }
  }

  private async restoreObservedSurface(
    state: CaptureSurfaceLeaseState,
    current: CaptureSurfaceLeaseState['prior']
  ): Promise<void> {
    if (captureSurfaceSnapshotsEqual(state.entry.applied, current)) {
      await restoreCaptureSurfaceSnapshot(state);
      return;
    }
    if (captureSurfaceSnapshotsEqual(state.prior, current)) return;
    state.entry.phase = 'conflict';
    state.entry.updatedAt = this.registry.nextTimestamp();
    await this.registry.persist();
    throw new CaptureSurfaceError('restore-conflict');
  }

  private async resumeCrossTargetParent(
    state: CaptureSurfaceLeaseState,
    parent: CaptureSurfaceLeaseState
  ): Promise<void> {
    try {
      await transitionCaptureSurfaceSnapshot({
        expected: [parent.prior],
        next: parent.entry.applied,
        state: parent,
      });
    } catch (error) {
      state.entry.phase = 'conflict';
      state.entry.updatedAt = this.registry.nextTimestamp();
      await this.registry.persist();
      throw error;
    }
  }

  private async transferViewportAcquisition(
    state: CaptureSurfaceLeaseState,
    parent: CaptureSurfaceLeaseState | undefined,
    observationAcquired: boolean
  ): Promise<boolean> {
    const sharesViewportClient =
      parent?.applied.target === 'viewport' &&
      state.applied.target === 'viewport' &&
      (parent.entry.owner === 'video') === (state.entry.owner === 'video');
    if (!sharesViewportClient) return false;
    if (state.viewportAcquisitionOwned) {
      parent.viewportAcquisitionOwned = true;
      state.viewportAcquisitionOwned = false;
    }
    if (observationAcquired) parent.viewportAcquisitionOwned = true;
    return observationAcquired;
  }

  private async releaseOwnedViewportAcquisition(state: CaptureSurfaceLeaseState): Promise<void> {
    if (!state.viewportAcquisitionOwned) return;
    await releaseViewportSurfaceAcquisition({
      owner: state.entry.owner,
      tabId: state.entry.tabId,
    });
    state.viewportAcquisitionOwned = false;
  }
}
