import type { CaptureSurfaceLeaseRegistry } from './lease-registry';
import type { CaptureSurfaceReleaseRequest } from './types';
import { CaptureSurfaceError } from './types';
import { prepareViewportSurface, setViewportSurface } from './viewport';
import { getWindowSnapshot, windowSnapshotsEqual } from './window';
import type { WindowSnapshot } from './restoration';

export class CaptureSurfaceLeaseReassertion {
  constructor(private readonly registry: CaptureSurfaceLeaseRegistry) {}

  async reassert(request: CaptureSurfaceReleaseRequest): Promise<void> {
    const state = this.registry.getLease(request.leaseId);
    if (
      !state ||
      state.applied.sessionId !== request.sessionId ||
      state.applied.generation !== request.generation ||
      state.entry.phase !== 'applied' ||
      this.registry.getStack(state.entry.tabId)?.at(-1) !== state
    ) {
      throw new CaptureSurfaceError('stale-generation');
    }
    if (state.applied.target === 'viewport') {
      const prepared = await prepareViewportSurface({
        owner: state.entry.owner,
        tabId: state.entry.tabId,
      });
      try {
        await setViewportSurface({
          tabId: state.entry.tabId,
          width: state.applied.width,
          height: state.applied.height,
        });
        state.viewportAcquisitionOwned ||= prepared.acquired;
      } catch (error) {
        await prepared.releaseAcquisition();
        throw error;
      }
      return;
    }
    const current = await getWindowSnapshot(state.entry.windowId);
    if (!windowSnapshotsEqual(current, state.entry.applied as WindowSnapshot)) {
      state.entry.phase = 'conflict';
      await this.registry.persist();
      throw new CaptureSurfaceError('restore-conflict');
    }
  }

  async detectWindowConflict(windowId: number): Promise<void> {
    const active = [...this.registry.values()]
      .filter(
        (state) =>
          state.entry.windowId === windowId &&
          state.applied.target === 'window' &&
          state.entry.phase === 'applied'
      )
      .at(-1);
    if (!active || active.entry.applied.type !== 'window') return;
    const current = await getWindowSnapshot(windowId).catch(() => null);
    if (!current || !windowSnapshotsEqual(active.entry.applied, current)) {
      active.entry.phase = 'conflict';
      active.entry.updatedAt = this.registry.nextTimestamp();
      await this.registry.persist();
    }
  }
}
