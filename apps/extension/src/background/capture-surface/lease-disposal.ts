import type { CaptureSurfaceOwner } from '../storage/capture-surface/contracts';
import type { CaptureSurfaceLeaseRegistry } from './lease-registry';
import { captureSurfaceSnapshotsEqual, restoreCaptureSurfaceSnapshot } from './restoration';
import { CaptureSurfaceError, type CaptureSurfaceLeaseState } from './types';
import { acknowledgeClosedViewportTab } from './viewport';
import { getWindowSnapshot } from './window';

export class CaptureSurfaceLeaseDisposal {
  constructor(private readonly registry: CaptureSurfaceLeaseRegistry) {}

  async terminateClosedTab(tabId: number, owners: ReadonlySet<CaptureSurfaceOwner>): Promise<void> {
    const stack = this.registry.getStack(tabId);
    while (stack?.length) {
      const state = stack.at(-1)!;
      if (!owners.has(state.entry.owner)) {
        if (!stack.some((candidate) => owners.has(candidate.entry.owner))) return;
        throw new CaptureSurfaceError(
          'surface-busy',
          'A closing-tab surface is suspended beneath another owner'
        );
      }
      if (state.applied.target === 'window') {
        await this.terminateWindowState(state);
        continue;
      }
      state.entry.phase = 'releasing';
      state.entry.updatedAt = this.registry.nextTimestamp();
      await this.registry.persist();
      acknowledgeClosedViewportTab(tabId);
      this.registry.remove(state);
      await this.registry.persist();
    }
  }

  async handleDebuggerDetach(tabId: number): Promise<readonly CaptureSurfaceOwner[]> {
    acknowledgeClosedViewportTab(tabId);
    const stack = this.registry.getStack(tabId);
    if (!stack?.some((state) => state.applied.target === 'viewport')) return [];
    if (
      stack.some((state) => state.applied.target === 'viewport' && state.entry.owner === 'video')
    ) {
      return [];
    }

    const removedOwners = new Set<CaptureSurfaceOwner>();
    for (let index = stack.length - 1; index >= 0; index -= 1) {
      const state = stack[index];
      if (!state || state.applied.target !== 'viewport') continue;
      removedOwners.add(state.entry.owner);
      state.viewportAcquisitionOwned = false;
      const child = stack[index + 1];
      if (child) this.registry.discardSuspended(state, child);
      else this.registry.remove(state);
    }
    const resumed = stack.at(-1);
    if (resumed) resumed.entry.phase = 'applied';
    await this.registry.persist();
    return [...removedOwners];
  }

  private async terminateWindowState(state: CaptureSurfaceLeaseState): Promise<void> {
    state.entry.phase = 'releasing';
    state.entry.updatedAt = this.registry.nextTimestamp();
    await this.registry.persist();
    const current = await getWindowSnapshot(state.entry.windowId);
    if (captureSurfaceSnapshotsEqual(state.entry.applied, current)) {
      await restoreCaptureSurfaceSnapshot(state);
    } else if (!captureSurfaceSnapshotsEqual(state.prior, current)) {
      state.entry.phase = 'conflict';
      state.entry.updatedAt = this.registry.nextTimestamp();
      await this.registry.persist();
      throw new CaptureSurfaceError('restore-conflict');
    }
    this.registry.remove(state);
    await this.registry.persist();
  }
}
