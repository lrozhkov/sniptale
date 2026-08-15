import type { CaptureSurfaceOwner } from '../storage/capture-surface/contracts';
import type { CaptureSurfaceLeaseRegistry } from './lease-registry';
import { captureSurfaceSnapshotsEqual, restoreCaptureSurfaceSnapshot } from './restoration';
import { CaptureSurfaceError, type CaptureSurfaceLeaseState } from './types';
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
      await this.terminateWindowState(state);
    }
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
