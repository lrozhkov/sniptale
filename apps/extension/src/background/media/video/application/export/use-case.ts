import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import type { VideoProjectExportSettings } from '../../../../../features/video/project/types';
import * as settingsValidation from '../../../../../features/video/project/export/settings-validation';
import { getDefaultBackgroundProjectExportPorts, type BackgroundProjectExportPorts } from './ports';
import { acquireMediaMutationPermit } from '../../../lifecycle-gate';
import type { ProjectExportInputReference } from '../../../../../contracts/video/types/project-export-input';
import { coordinateProjectExportLifecycle } from './coordination';
import { ensureProjectExportOffscreenReady, type ProjectExportOwnerIdentity } from './capabilities';

export { getProjectExportCapabilitiesUseCase } from './capabilities';
export type { ProjectExportOwnerIdentity } from './capabilities';

const { assertVideoProjectExportSettingsCompatibleWithProject } = settingsValidation;

type ProjectExportAck = { error?: string | undefined; success?: boolean | undefined };

function assertAcceptedProjectExportAck(
  response: ProjectExportAck | undefined,
  fallbackError: string
): void {
  if (response?.success === true) {
    return;
  }

  throw new Error(response?.error ?? fallbackError);
}

async function startProjectExportInOffscreen(
  message: {
    input: ProjectExportInputReference;
    jobId: string;
    settings: VideoProjectExportSettings;
  },
  owner: ProjectExportOwnerIdentity,
  ports: BackgroundProjectExportPorts
): Promise<void> {
  await ports.reserveProjectExportJobLedgerEntry({
    jobId: message.jobId,
    ownerDocumentId: owner.documentId,
    ownerSenderUrl: owner.senderUrl,
    projectId: message.input.projectId,
  });

  try {
    const response = await ports.sendRuntimeMessage(
      await ports.attachOffscreenCommandCapability({
        type: VideoMessageType.OFFSCREEN_START_PROJECT_EXPORT,
        input: message.input,
        jobId: message.jobId,
        settings: message.settings,
      })
    );
    assertAcceptedProjectExportAck(response, 'Project export launch rejected');
  } catch (error) {
    await ports
      .markProjectExportJobTerminal(message.jobId, 'failed', String(error))
      .catch(() => undefined);
    throw error;
  }
}

export async function startProjectExportUseCase(
  message: {
    input: ProjectExportInputReference;
    jobId: string;
    settings: VideoProjectExportSettings;
  },
  owner: ProjectExportOwnerIdentity,
  ports: BackgroundProjectExportPorts = getDefaultBackgroundProjectExportPorts()
): Promise<{
  capabilityToken: string;
  jobId: string;
  ownerDocumentId: string;
  success: true;
}> {
  try {
    if (message.jobId !== message.input.jobId) throw new Error('Project export input job mismatch');
    const project = await ports.loadProjectExportInput(message.input);
    assertVideoProjectExportSettingsCompatibleWithProject(project, message.settings);
    return await coordinateProjectExportLifecycle(async () => {
      const releaseStartPermit = acquireMediaMutationPermit();
      if (!releaseStartPermit) {
        throw new Error('Local data erasure is in progress');
      }
      try {
        return await startProjectExportWithPermit(message, owner, ports);
      } finally {
        releaseStartPermit();
      }
    });
  } catch (error) {
    await ports.deleteProjectExportInput(message.jobId).catch(() => undefined);
    throw error;
  }
}

async function startProjectExportWithPermit(
  message: {
    input: ProjectExportInputReference;
    jobId: string;
    settings: VideoProjectExportSettings;
  },
  owner: ProjectExportOwnerIdentity,
  ports: BackgroundProjectExportPorts
): Promise<{
  capabilityToken: string;
  jobId: string;
  ownerDocumentId: string;
  success: true;
}> {
  await ensureProjectExportOffscreenReady('Rendering video project export', ports);
  const capabilityToken = await ports.issueProjectExportCancelCapability({
    documentId: owner.documentId,
    jobId: message.jobId,
    senderUrl: owner.senderUrl,
  });
  try {
    await startProjectExportInOffscreen(message, owner, ports);
  } catch (error) {
    await ports
      .consumeProjectExportCancelCapability({
        documentId: owner.documentId,
        jobId: message.jobId,
        senderUrl: owner.senderUrl,
        token: capabilityToken,
      })
      .catch(() => undefined);
    throw error;
  }
  return {
    success: true,
    capabilityToken,
    jobId: message.jobId,
    ownerDocumentId: owner.documentId,
  };
}

export async function cancelProjectExportUseCase(
  message: { jobId: string },
  ports: BackgroundProjectExportPorts = getDefaultBackgroundProjectExportPorts()
): Promise<{ jobId: string; result: 'accepted'; success: true }> {
  return coordinateProjectExportLifecycle(async () => {
    await ports.requestProjectExportJobCancel(message.jobId);
    const response = await ports.sendRuntimeMessage(
      await ports.attachOffscreenCommandCapability({
        type: VideoMessageType.OFFSCREEN_CANCEL_PROJECT_EXPORT,
        jobId: message.jobId,
      })
    );
    assertAcceptedProjectExportAck(response, 'Project export cancel rejected');
    return { success: true, jobId: message.jobId, result: 'accepted' };
  });
}
