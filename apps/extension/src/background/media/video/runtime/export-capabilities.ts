import { browserSessionProjectExportCapabilityStore } from '../../../storage/video/project-export-capabilities';
import type { VideoProjectExportSettings } from '../../../../features/video/project/types';
import { createProjectExportCapabilityService } from './export-capability-service';

function createCapabilityToken(): string {
  const randomUUID = globalThis.crypto?.randomUUID;
  if (!randomUUID) {
    throw new Error('Project export capability token generation is unavailable.');
  }
  return randomUUID.call(globalThis.crypto);
}

const defaultProjectExportCapabilityService = createProjectExportCapabilityService({
  now: () => Date.now(),
  persistedStore: browserSessionProjectExportCapabilityStore,
  randomId: createCapabilityToken,
});

export type { ProjectExportCapabilityService } from './export-capability-service-types';

export function issueProjectExportStartCapability(args: {
  documentId: string;
  jobId: string;
  senderUrl: string;
  settings: VideoProjectExportSettings;
}): Promise<string> {
  return defaultProjectExportCapabilityService.issueProjectExportStartCapability(args);
}

export function consumeProjectExportStartCapability(args: {
  documentId: string;
  jobId: string;
  senderUrl: string;
  settings: VideoProjectExportSettings;
  token: string;
}): Promise<boolean> {
  return defaultProjectExportCapabilityService.consumeProjectExportStartCapability(args);
}

export function issueProjectExportCancelCapability(args: {
  documentId: string;
  jobId: string;
  senderUrl: string;
}): Promise<string> {
  return defaultProjectExportCapabilityService.issueProjectExportCancelCapability(args);
}

export function consumeProjectExportCancelCapability(args: {
  documentId: string;
  jobId: string;
  senderUrl: string;
  token: string;
}): Promise<boolean> {
  return defaultProjectExportCapabilityService.consumeProjectExportCancelCapability(args);
}

export function resetProjectExportRuntimeCapabilitiesForTests(): void {
  defaultProjectExportCapabilityService.resetForTests();
}

export function clearProjectExportRuntimeCapabilityCacheForTests(): void {
  defaultProjectExportCapabilityService.clearCacheForTests();
}
