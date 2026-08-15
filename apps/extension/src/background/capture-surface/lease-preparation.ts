import { browserTabs } from '@sniptale/platform/browser/tabs';
import type { ViewportPreset } from '../../features/viewport-presets/contracts';
import {
  getCaptureSurfaceAvailability,
  hasCaptureSurfaceConflict,
  resolveCaptureSurfacePreset,
} from './availability';
import type { CaptureSurfaceLeaseRegistry } from './lease-registry';
import type {
  AppliedCaptureSurface,
  CaptureSurfaceLeaseRequest,
  CaptureSurfaceLeaseState,
} from './types';
import { CaptureSurfaceError } from './types';
import { prepareWindowSize, windowSnapshotsEqual } from './window';

type ResolvedApplyContext = {
  parent: CaptureSurfaceLeaseState | null;
  preset: ViewportPreset;
  stack: CaptureSurfaceLeaseState[];
  windowId: number;
};

export class CaptureSurfaceLeasePreparation {
  constructor(private readonly registry: CaptureSurfaceLeaseRegistry) {}

  async resolveContext(request: CaptureSurfaceLeaseRequest): Promise<ResolvedApplyContext> {
    this.registry.assertNextGeneration(request.sessionId, request.generation);
    const availability = await getCaptureSurfaceAvailability(request, this.registry.values());
    if (availability.status === 'unavailable') throw new CaptureSurfaceError(availability.reason);
    const preset = await resolveCaptureSurfacePreset(request.presetId);
    if (!preset?.enabled) throw new CaptureSurfaceError(preset ? 'disabled' : 'missing');
    const tab = await browserTabs.get(request.tabId);
    if (!tab.windowId) throw new CaptureSurfaceError('unsupported-context');
    if (hasCaptureSurfaceConflict(this.registry.values(), request.tabId, tab.windowId)) {
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
      target: 'window',
      width: preset.width,
      height: preset.height,
    };
  }

  async prepareLease(
    request: CaptureSurfaceLeaseRequest,
    applied: AppliedCaptureSurface,
    windowId: number,
    parent: CaptureSurfaceLeaseState | null
  ): Promise<CaptureSurfaceLeaseState> {
    const prepared = await prepareWindowSize(windowId, applied.width, applied.height);
    const prior = parent ? parent.entry.applied : prepared.prior;
    if (parent && !windowSnapshotsEqual(prior, prepared.prior)) {
      throw new CaptureSurfaceError('restore-conflict');
    }
    return {
      applied,
      prior,
      entry: {
        version: 1,
        sessionId: request.sessionId,
        leaseId: applied.leaseId,
        generation: request.generation,
        owner: request.owner,
        tabId: request.tabId,
        windowId,
        presetId: request.presetId,
        target: 'window',
        prior,
        applied: prepared.expected,
        phase: 'prepared',
        parentLeaseId: parent?.applied.leaseId ?? null,
        updatedAt: this.registry.nextTimestamp(),
      },
    };
  }
}
