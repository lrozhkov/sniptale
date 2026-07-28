import type { CaptureSurfaceLeaseRegistry } from './lease-registry';
import { transitionCaptureSurfaceSnapshot, type WindowSnapshot } from './restoration';
import type { CaptureSurfaceLeaseRequest, CaptureSurfaceLeaseState } from './types';
import { CaptureSurfaceMutationError } from './types';
import { releaseViewportSurfaceAcquisition, setViewportSurface } from './viewport';
import { applyPreparedWindowSize } from './window';

export class CaptureSurfaceLeaseMutation {
  constructor(private readonly registry: CaptureSurfaceLeaseRegistry) {}

  async suspendCrossTargetParent(parent: CaptureSurfaceLeaseState): Promise<void> {
    const previousPhase = parent.entry.phase;
    const previousUpdatedAt = parent.entry.updatedAt;
    parent.entry.phase = 'suspended';
    parent.entry.updatedAt = this.registry.nextTimestamp();
    try {
      await this.registry.persist();
    } catch (error) {
      parent.entry.phase = previousPhase;
      parent.entry.updatedAt = previousUpdatedAt;
      throw error;
    }
    try {
      await transitionCaptureSurfaceSnapshot({
        expected: [parent.entry.applied],
        next: parent.prior,
        state: parent,
      });
      if (parent.applied.target === 'viewport' && parent.prior.type === 'native') {
        parent.viewportAcquisitionOwned = false;
      }
    } catch (error) {
      await this.markConflict(parent);
      throw error;
    }
  }

  async resumeSuspendedParent(parent: CaptureSurfaceLeaseState): Promise<void> {
    try {
      await transitionCaptureSurfaceSnapshot({
        expected: [parent.prior],
        next: parent.entry.applied,
        state: parent,
      });
      parent.entry.phase = 'applied';
      parent.entry.updatedAt = this.registry.nextTimestamp();
      await this.registry.persist();
    } catch (error) {
      await this.markConflict(parent);
      throw error;
    }
  }

  async stage(
    state: CaptureSurfaceLeaseState,
    parent: CaptureSurfaceLeaseState | null,
    stack: CaptureSurfaceLeaseState[]
  ): Promise<void> {
    this.registry.add(state, parent, stack);
    await this.registry.persist();
  }

  async mutate(state: CaptureSurfaceLeaseState): Promise<void> {
    try {
      if (state.applied.target === 'viewport') {
        await setViewportSurface({
          tabId: state.entry.tabId,
          width: state.applied.width,
          height: state.applied.height,
        });
        return;
      }
      await applyPreparedWindowSize(
        state.entry.windowId,
        state.prior as WindowSnapshot,
        state.entry.applied as WindowSnapshot
      );
    } catch (error) {
      if (error instanceof CaptureSurfaceMutationError && error.observedSnapshot) {
        state.ownedMutationSnapshot = error.observedSnapshot;
      }
      throw error;
    }
  }

  async commit(args: {
    parent: CaptureSurfaceLeaseState | null;
    replaceCurrent: boolean;
    request: CaptureSurfaceLeaseRequest;
    state: CaptureSurfaceLeaseState;
  }): Promise<void> {
    const { parent, replaceCurrent, request, state } = args;
    state.entry.phase = 'applied';
    state.entry.updatedAt = this.registry.nextTimestamp();
    if (replaceCurrent && parent) {
      if (parent.applied.target === state.applied.target) {
        await this.registry.persistReplacement(state, parent);
        this.registry.collapseReplacedParent(state, parent);
      } else {
        await this.registry.persistCrossTargetReplacement(state, parent);
        this.registry.collapseCrossTargetReplacedParent(state, parent);
      }
    } else {
      await this.registry.persist();
    }
    this.registry.recordGeneration(request.sessionId, request.generation);
  }

  async rollback(
    state: CaptureSurfaceLeaseState,
    parent: CaptureSurfaceLeaseState | null
  ): Promise<void> {
    try {
      await transitionCaptureSurfaceSnapshot({
        expected: state.ownedMutationSnapshot
          ? [state.entry.applied, state.ownedMutationSnapshot]
          : [state.entry.applied],
        next: state.prior,
        state,
      });
      if (parent && parent.applied.target !== state.applied.target) {
        await this.resumeSuspendedParent(parent);
      }
      await this.releaseOwnedViewportAcquisition(state);
      this.registry.remove(state);
      if (parent && parent.applied.target === state.applied.target) {
        parent.entry.phase = 'applied';
      }
      await this.registry.persist();
    } catch (error) {
      await this.markConflict(state);
      throw error;
    }
  }

  private async markConflict(state: CaptureSurfaceLeaseState): Promise<void> {
    state.entry.phase = 'conflict';
    state.entry.updatedAt = this.registry.nextTimestamp();
    await this.registry.persist();
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
