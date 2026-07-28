// policyStateId: capture-surface-leases - the service rehydrates session-storage WAL before admitting mutations.
import { DefaultCaptureSurfaceService } from './service';

export type {
  AppliedCaptureSurface,
  CaptureSurfaceContext,
  CaptureSurfaceLeaseRequest,
  CaptureSurfaceReleaseRequest,
  CaptureSurfaceService,
} from './types';
export { CaptureSurfaceError } from './types';
export { DefaultCaptureSurfaceService } from './service';

let defaultService: DefaultCaptureSurfaceService | null = null;

export function getCaptureSurfaceService(): DefaultCaptureSurfaceService {
  defaultService ??= new DefaultCaptureSurfaceService();
  return defaultService;
}

export function recoverCaptureSurfaces(
  liveSessionIds?: ReadonlySet<string> | Promise<ReadonlySet<string>>
): Promise<void> {
  return getCaptureSurfaceService().recover(liveSessionIds === undefined ? {} : { liveSessionIds });
}

export function resetCaptureSurfaceServiceForTests(): void {
  defaultService = null;
}
