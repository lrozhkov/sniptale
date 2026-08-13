import type { CaptureSurfaceOwner } from '../storage/capture-surface/contracts';
import type { CaptureSurfaceLeaseRegistry } from './lease-registry';
import {
  captureSurfaceSnapshotsEqual,
  readCurrentSurfaceSnapshot,
  restoreCaptureSurfaceSnapshot,
} from './restoration';
import type {
  BeforeCaptureSurfaceOwnerRelease,
  CaptureSurfaceLeaseState,
  CaptureSurfaceReleaseRequest,
} from './types';
import { CaptureSurfaceError } from './types';

export class CaptureSurfaceLeaseRelease {
  constructor(private readonly registry: CaptureSurfaceLeaseRegistry) {}

  async abandonConflicted(request: CaptureSurfaceReleaseRequest): Promise<void> {
    const state = this.requireExactTopLease(request);
    if (state.entry.phase !== 'conflict') throw new CaptureSurfaceError('stale-generation');
    const stack = this.registry.getStack(state.entry.tabId);
    const parent = stack?.at(-2);
    this.registry.remove(state);
    if (parent) {
      parent.entry.phase = 'conflict';
      parent.entry.updatedAt = this.registry.nextTimestamp();
    }
    await this.registry.persist();
  }

  async release(request: CaptureSurfaceReleaseRequest): Promise<void> {
    const state = this.requireExactTopLease(request);
    const stack = this.registry.getStack(state.entry.tabId);
    state.entry.phase = 'releasing';
    state.entry.updatedAt = this.registry.nextTimestamp();
    await this.registry.persist();
    const observation = await readCurrentSurfaceSnapshot(state);
    if (captureSurfaceSnapshotsEqual(state.entry.applied, observation.current)) {
      await restoreCaptureSurfaceSnapshot(state);
    } else if (!captureSurfaceSnapshotsEqual(state.prior, observation.current)) {
      state.entry.phase = 'conflict';
      state.entry.updatedAt = this.registry.nextTimestamp();
      await this.registry.persist();
      throw new CaptureSurfaceError('restore-conflict');
    }
    this.registry.remove(state);
    const parent = stack?.at(-1);
    if (parent) parent.entry.phase = 'applied';
    await this.registry.persist();
  }

  private requireExactTopLease(request: CaptureSurfaceReleaseRequest): CaptureSurfaceLeaseState {
    const state = this.registry.getLease(request.leaseId);
    if (
      !state ||
      state.applied.sessionId !== request.sessionId ||
      state.applied.generation !== request.generation ||
      this.registry.getStack(state.entry.tabId)?.at(-1) !== state
    ) {
      throw new CaptureSurfaceError('stale-generation');
    }
    return state;
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
        target: 'window',
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
      await this.registry.persistDiscardedSuspended(suspended, child);
      this.registry.discardSuspended(suspended, child);
    }
  }
}
