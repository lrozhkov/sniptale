// policyStateId: capture-surface-leases - the service rehydrates session-storage WAL before admitting mutations.
import { DefaultCaptureSurfaceService } from './service';
import type { CaptureSurfaceRecoveryOptions } from './types';

export type {
  AppliedCaptureSurface,
  AppliedCaptureSurfaceBinding,
  BeforeAbandonedCaptureSurfaceRestore,
  BeforeAbandonedCaptureSurfaceStackRestore,
  BeforeCaptureSurfaceOwnerRelease,
  CaptureSurfaceContext,
  CaptureSurfaceLeaseRequest,
  CaptureSurfaceLeaseIdentity,
  CaptureSurfaceOwnerReleaseOptions,
  CaptureSurfaceReleaseRequest,
  CaptureSurfaceRecoveryOptions,
  CaptureSurfaceService,
} from './types';
export { CaptureSurfaceError } from './types';
export { DefaultCaptureSurfaceService } from './service';

let defaultService: DefaultCaptureSurfaceService | null = null;

export function getCaptureSurfaceService(): DefaultCaptureSurfaceService {
  defaultService ??= new DefaultCaptureSurfaceService();
  return defaultService;
}

export function recoverCaptureSurfaces(args: CaptureSurfaceRecoveryOptions = {}): Promise<void> {
  return getCaptureSurfaceService().recover(args);
}

export function resetCaptureSurfaceServiceForTests(): void {
  defaultService = null;
}
