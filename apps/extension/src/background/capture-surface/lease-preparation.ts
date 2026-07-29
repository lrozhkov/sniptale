import { browserTabs } from '@sniptale/platform/browser/tabs';
import type { ViewportPreset } from '../../features/viewport-presets/contracts';
import { isViewportPresetAllowedForVideoCaptureMode } from '../../features/viewport-presets/video-recording-policy';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import type { CaptureSurfaceSnapshot } from '../storage/capture-surface/contracts';
import {
  getCaptureSurfaceAvailability,
  hasCaptureSurfaceConflict,
  resolveCaptureSurfacePreset,
} from './availability';
import type { CaptureSurfaceLeaseRegistry } from './lease-registry';
import type { ViewportSnapshot, WindowSnapshot } from './restoration';
import type {
  AppliedCaptureSurface,
  CaptureSurfaceLeaseRequest,
  CaptureSurfaceLeaseState,
} from './types';
import { CaptureSurfaceError } from './types';
import { prepareViewportSurface, viewportSnapshotMatches } from './viewport';
import { prepareWindowSize, windowSnapshotsEqual } from './window';

type ResolvedApplyContext = {
  parent: CaptureSurfaceLeaseState | null;
  preset: ViewportPreset;
  stack: CaptureSurfaceLeaseState[];
  windowId: number;
};

function snapshotForApplied(applied: AppliedCaptureSurface): CaptureSurfaceSnapshot {
  return {
    type: 'viewport',
    presetId: applied.presetId,
    width: applied.width,
    height: applied.height,
  };
}

export class CaptureSurfaceLeasePreparation {
  constructor(private readonly registry: CaptureSurfaceLeaseRegistry) {}

  async resolveContext(request: CaptureSurfaceLeaseRequest): Promise<ResolvedApplyContext> {
    this.registry.assertNextGeneration(request.sessionId, request.generation);
    const availability = await getCaptureSurfaceAvailability(request, this.registry.values());
    if (availability.status === 'unavailable') {
      throw new CaptureSurfaceError(availability.reason);
    }
    const preset = await resolveCaptureSurfacePreset(request.presetId);
    if (!preset?.enabled) throw new CaptureSurfaceError(preset ? 'disabled' : 'missing');
    if (
      request.context === 'video-tab-crop' &&
      !isViewportPresetAllowedForVideoCaptureMode(CaptureMode.TAB_CROP, preset)
    ) {
      throw new CaptureSurfaceError('unsupported-context');
    }
    const tab = await browserTabs.get(request.tabId);
    if (!tab.windowId) throw new CaptureSurfaceError('unsupported-context');
    if (
      hasCaptureSurfaceConflict(this.registry.values(), request.tabId, tab.windowId, preset.target)
    ) {
      throw new CaptureSurfaceError('surface-busy');
    }
    const stack = this.registry.getOrCreateStack(request.tabId);
    const parent = stack.at(-1) ?? null;
    if (parent?.entry.owner === 'video') {
      throw new CaptureSurfaceError('surface-busy', 'An active video surface cannot be replaced');
    }
    return { parent, preset, stack, windowId: tab.windowId };
  }

  createAppliedSurface(
    request: CaptureSurfaceLeaseRequest,
    preset: ViewportPreset
  ): AppliedCaptureSurface {
    return {
      sessionId: request.sessionId,
      leaseId: crypto.randomUUID(),
      generation: request.generation,
      presetId: preset.id,
      target: preset.target,
      width: preset.width,
      height: preset.height,
    };
  }

  prepareLease(
    request: CaptureSurfaceLeaseRequest,
    applied: AppliedCaptureSurface,
    windowId: number,
    parent: CaptureSurfaceLeaseState | null
  ): Promise<CaptureSurfaceLeaseState> {
    return applied.target === 'viewport'
      ? this.prepareViewportLease(request, applied, windowId, parent)
      : this.prepareWindowLease(request, applied, windowId, parent);
  }

  private async prepareViewportLease(
    request: CaptureSurfaceLeaseRequest,
    applied: AppliedCaptureSurface,
    windowId: number,
    parent: CaptureSurfaceLeaseState | null
  ): Promise<CaptureSurfaceLeaseState> {
    const prepared = await prepareViewportSurface({ owner: request.owner, tabId: request.tabId });
    try {
      const prior: ViewportSnapshot =
        parent?.applied.target === 'viewport'
          ? (parent.entry.applied as ViewportSnapshot)
          : { type: 'native', ...prepared.current };
      if (
        parent?.applied.target === 'viewport' &&
        !viewportSnapshotMatches(prior, prepared.current)
      ) {
        throw new CaptureSurfaceError('restore-conflict');
      }
      const capacity = this.registry.findViewportCapacity(request.tabId) ?? prepared.current;
      if (applied.width > capacity.width || applied.height > capacity.height) {
        throw new CaptureSurfaceError('viewport-too-large');
      }
      return this.createLeaseState(
        request,
        applied,
        windowId,
        prior,
        snapshotForApplied(applied),
        parent,
        prepared.acquired
      );
    } catch (error) {
      await prepared.releaseAcquisition();
      throw error;
    }
  }

  private async prepareWindowLease(
    request: CaptureSurfaceLeaseRequest,
    applied: AppliedCaptureSurface,
    windowId: number,
    parent: CaptureSurfaceLeaseState | null
  ): Promise<CaptureSurfaceLeaseState> {
    const prepared = await prepareWindowSize(windowId, applied.width, applied.height);
    const prior =
      parent?.applied.target === 'window'
        ? (parent.entry.applied as WindowSnapshot)
        : prepared.prior;
    if (parent?.applied.target === 'window' && !windowSnapshotsEqual(prior, prepared.prior)) {
      throw new CaptureSurfaceError('restore-conflict');
    }
    return this.createLeaseState(
      request,
      applied,
      windowId,
      prior,
      prepared.expected,
      parent,
      false
    );
  }

  private createLeaseState(
    request: CaptureSurfaceLeaseRequest,
    applied: AppliedCaptureSurface,
    windowId: number,
    prior: CaptureSurfaceSnapshot,
    appliedSnapshot: CaptureSurfaceSnapshot,
    parent: CaptureSurfaceLeaseState | null,
    viewportAcquisitionOwned: boolean
  ): CaptureSurfaceLeaseState {
    return {
      applied,
      prior,
      viewportAcquisitionOwned,
      entry: {
        version: 1,
        sessionId: request.sessionId,
        leaseId: applied.leaseId,
        generation: request.generation,
        owner: request.owner,
        tabId: request.tabId,
        windowId,
        presetId: request.presetId,
        target: applied.target,
        prior,
        applied: appliedSnapshot,
        phase: 'prepared',
        parentLeaseId: parent?.applied.leaseId ?? null,
        updatedAt: this.registry.nextTimestamp(),
      },
    };
  }
}
