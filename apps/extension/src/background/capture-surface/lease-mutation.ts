import type { CaptureSurfaceLeaseRegistry } from './lease-registry';
import { transitionCaptureSurfaceSnapshot, type WindowSnapshot } from './restoration';
import type { CaptureSurfaceLeaseRequest, CaptureSurfaceLeaseState } from './types';
import { CaptureSurfaceMutationError } from './types';
import { applyPreparedWindowSize } from './window';

export class CaptureSurfaceLeaseMutation {
  constructor(private readonly registry: CaptureSurfaceLeaseRegistry) {}

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
      await this.registry.persistReplacement(state, parent);
      this.registry.collapseReplacedParent(state, parent);
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
      this.registry.remove(state);
      if (parent) parent.entry.phase = 'applied';
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
}
