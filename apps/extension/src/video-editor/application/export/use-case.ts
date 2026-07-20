import type {
  ProjectExportCapabilitiesResponse,
  StartProjectExportResponse,
} from '../../../contracts/messaging/contracts/response-types';
import {
  createRuntimeMessagingTransport,
  type RuntimeMessagingTransport,
} from '../../../platform/runtime-messaging';
import type { VideoProjectExportSettings } from '../../../features/video/project/types/export';
import type { VideoProject } from '../../../features/video/project/types/model';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import {
  deleteProjectExportInput,
  stageProjectExportInput,
} from '../../../composition/persistence/project-export-inputs';

export type VideoProjectExportClient = Pick<RuntimeMessagingTransport, 'sendRuntimeMessage'> & {
  deleteProjectExportInput(jobId: string): Promise<void>;
  stageProjectExportInput(
    jobId: string,
    project: VideoProject
  ): ReturnType<typeof stageProjectExportInput>;
};

// policyStateIds: ['project-export-capabilities'] - cached owner/cancel metadata mirrors
// background-issued project export capabilities and is reset between editor runtimes/tests.
function createVideoProjectExportClient(
  transport: RuntimeMessagingTransport = createRuntimeMessagingTransport()
): VideoProjectExportClient {
  return {
    deleteProjectExportInput,
    sendRuntimeMessage: transport.sendRuntimeMessage,
    stageProjectExportInput,
  };
}

const cancelCapabilityTokensByJobId = new Map<string, string>();
const exportSettingsByJobId = new Map<string, VideoProjectExportSettings>();
const ownerDocumentIdsByJobId = new Map<string, string>();
let defaultVideoProjectExportClient: VideoProjectExportClient | null = null;

function getDefaultVideoProjectExportClient(): VideoProjectExportClient {
  defaultVideoProjectExportClient ??= createVideoProjectExportClient();
  return defaultVideoProjectExportClient;
}

function rememberProjectExportOwnerDocument(jobId: string, ownerDocumentId: unknown): void {
  if (typeof ownerDocumentId === 'string' && ownerDocumentId.length > 0) {
    ownerDocumentIdsByJobId.set(jobId, ownerDocumentId);
  }
}

async function requestProjectExportStartCapability(
  jobId: string,
  settings: VideoProjectExportSettings,
  client: VideoProjectExportClient
): Promise<string> {
  const response = await client.sendRuntimeMessage({
    type: VideoMessageType.GET_PROJECT_EXPORT_CAPABILITIES,
    jobId,
    settings,
  });
  if (!response.success || typeof response.capabilityToken !== 'string') {
    throw new Error(response.error || 'Project export capability request failed');
  }
  rememberProjectExportOwnerDocument(jobId, response.ownerDocumentId);
  return response.capabilityToken;
}

export async function startProjectExport(
  jobId: string,
  project: VideoProject,
  settings: VideoProjectExportSettings,
  client: VideoProjectExportClient = getDefaultVideoProjectExportClient()
): Promise<StartProjectExportResponse> {
  const capabilityToken = await requestProjectExportStartCapability(jobId, settings, client);
  const input = await client.stageProjectExportInput(jobId, project);
  let response: StartProjectExportResponse;
  try {
    response = await client.sendRuntimeMessage({
      type: VideoMessageType.START_PROJECT_EXPORT,
      capabilityToken,
      input,
      jobId,
      settings,
    });
  } catch (error) {
    await client.deleteProjectExportInput(jobId).catch(() => undefined);
    throw error;
  }
  if (!response.success) {
    await client.deleteProjectExportInput(jobId).catch(() => undefined);
  }
  if (response.success && typeof response.capabilityToken === 'string') {
    cancelCapabilityTokensByJobId.set(jobId, response.capabilityToken);
    exportSettingsByJobId.set(jobId, settings);
    rememberProjectExportOwnerDocument(jobId, response.ownerDocumentId);
  }
  return response;
}

async function requestProjectExportCancelCapability(
  jobId: string,
  client: VideoProjectExportClient
): Promise<string> {
  const settings = exportSettingsByJobId.get(jobId);
  if (!settings) {
    throw new Error('Project export cancellation capability is unavailable');
  }
  const response = await client.sendRuntimeMessage({
    type: VideoMessageType.GET_PROJECT_EXPORT_CAPABILITIES,
    jobId,
    settings,
  });
  if (!response.success || typeof response.cancelCapabilityToken !== 'string') {
    throw new Error(response.error || 'Project export cancellation capability request failed');
  }
  cancelCapabilityTokensByJobId.set(jobId, response.cancelCapabilityToken);
  rememberProjectExportOwnerDocument(jobId, response.ownerDocumentId);
  return response.cancelCapabilityToken;
}

async function sendProjectExportCancelRequest(
  jobId: string,
  capabilityToken: string,
  client: VideoProjectExportClient
): Promise<void> {
  const response = await client.sendRuntimeMessage({
    type: VideoMessageType.CANCEL_PROJECT_EXPORT,
    capabilityToken,
    jobId,
  });
  if (!response?.success) {
    throw new Error(response?.error || 'Project export cancellation failed');
  }
}

export async function cancelProjectExport(
  jobId: string,
  client: VideoProjectExportClient = getDefaultVideoProjectExportClient()
): Promise<void> {
  const capabilityToken =
    cancelCapabilityTokensByJobId.get(jobId) ??
    (await requestProjectExportCancelCapability(jobId, client));
  try {
    await sendProjectExportCancelRequest(jobId, capabilityToken, client);
  } catch {
    cancelCapabilityTokensByJobId.delete(jobId);
    const reissuedCapabilityToken = await requestProjectExportCancelCapability(jobId, client);
    try {
      await sendProjectExportCancelRequest(jobId, reissuedCapabilityToken, client);
    } catch (retryError) {
      cancelCapabilityTokensByJobId.delete(jobId);
      throw retryError;
    }
  }
  cancelCapabilityTokensByJobId.delete(jobId);
  exportSettingsByJobId.delete(jobId);
  ownerDocumentIdsByJobId.delete(jobId);
}

export function getProjectExportCapabilities(
  settings: VideoProjectExportSettings,
  client: VideoProjectExportClient = getDefaultVideoProjectExportClient()
): Promise<ProjectExportCapabilitiesResponse> {
  return client.sendRuntimeMessage({
    type: VideoMessageType.GET_PROJECT_EXPORT_CAPABILITIES,
    settings,
  });
}

export function getProjectExportOwnerDocumentId(jobId: string): string | null {
  return ownerDocumentIdsByJobId.get(jobId) ?? null;
}

export function resetProjectExportOwnerRuntimeStateForTests(): void {
  cancelCapabilityTokensByJobId.clear();
  exportSettingsByJobId.clear();
  ownerDocumentIdsByJobId.clear();
  defaultVideoProjectExportClient = null;
}
