// policyStateId: project-export-capabilities - capability issuance delegates to the registered owner.
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';

import type { VideoProjectExportSettings } from '../../../../../features/video/project/types';
import { translate } from '../../../../../platform/i18n';
import { acquireMediaMutationPermit } from '../../../lifecycle-gate';
import { coordinateProjectExportLifecycle } from './coordination';
import { getDefaultBackgroundProjectExportPorts, type BackgroundProjectExportPorts } from './ports';

export type ProjectExportOwnerIdentity = {
  documentId: string;
  senderUrl: string;
};

type ProjectExportCapabilityResponse = {
  cancelCapabilityToken?: string | undefined;
  capabilityToken?: string | undefined;
  error?: string | undefined;
  ownerDocumentId?: string | undefined;
  success?: boolean | undefined;
};

export async function ensureProjectExportOffscreenReady(
  reason: string,
  ports: BackgroundProjectExportPorts
): Promise<void> {
  const created = await ports.ensureOffscreenDocument(reason);
  await ports.reconcileProjectExportLedgerAfterOffscreenCreation(created);
  if (!created && !ports.hasOffscreenDocument()) return;
  await ports.waitForOffscreenReady();
}

async function resolveProjectExportJobCapability(
  args: {
    jobId: string | undefined;
    owner: ProjectExportOwnerIdentity;
    settings: VideoProjectExportSettings;
  },
  ports: BackgroundProjectExportPorts
): Promise<{ cancelCapabilityToken?: string; startCapabilityToken?: string }> {
  if (!args.jobId) return {};

  const ledger = await ports.loadActiveProjectExportJobLedgerEntry();
  if (ledger?.status === 'running') {
    if (
      ledger.jobId === args.jobId &&
      ledger.ownerDocumentId === args.owner.documentId &&
      ledger.ownerSenderUrl === args.owner.senderUrl
    ) {
      return {
        cancelCapabilityToken: await ports.issueProjectExportCancelCapability({
          documentId: args.owner.documentId,
          jobId: args.jobId,
          senderUrl: args.owner.senderUrl,
        }),
      };
    }
    return {};
  }

  return {
    startCapabilityToken: await ports.issueProjectExportStartCapability({
      documentId: args.owner.documentId,
      jobId: args.jobId,
      senderUrl: args.owner.senderUrl,
      settings: args.settings,
    }),
  };
}

async function getProjectExportCapabilitiesWithPermit(
  message: { jobId?: string; settings: VideoProjectExportSettings },
  owner: ProjectExportOwnerIdentity,
  ports: BackgroundProjectExportPorts
): Promise<ProjectExportCapabilityResponse> {
  await ensureProjectExportOffscreenReady('Probing video export capabilities', ports);
  const response = await ports.sendRuntimeMessage(
    await ports.attachOffscreenCommandCapability({
      type: VideoMessageType.OFFSCREEN_GET_PROJECT_EXPORT_CAPABILITIES,
      settings: message.settings,
    })
  );
  if (response.success !== true) return response;

  const jobCapability = await resolveProjectExportJobCapability(
    { jobId: message.jobId, owner, settings: message.settings },
    ports
  );
  if (jobCapability.startCapabilityToken) {
    return {
      ...response,
      capabilityToken: jobCapability.startCapabilityToken,
      ownerDocumentId: owner.documentId,
    };
  }
  if (jobCapability.cancelCapabilityToken) {
    return {
      ...response,
      cancelCapabilityToken: jobCapability.cancelCapabilityToken,
      ownerDocumentId: owner.documentId,
    };
  }
  return message.jobId
    ? { error: translate('offscreenExport.alreadyRunning'), success: false }
    : response;
}

export async function getProjectExportCapabilitiesUseCase(
  message: { jobId?: string; settings: VideoProjectExportSettings },
  owner: ProjectExportOwnerIdentity,
  ports: BackgroundProjectExportPorts = getDefaultBackgroundProjectExportPorts()
): Promise<ProjectExportCapabilityResponse> {
  return coordinateProjectExportLifecycle(async () => {
    const releaseMutationPermit = acquireMediaMutationPermit();
    if (!releaseMutationPermit) {
      return { error: 'Local data erasure is in progress', success: false };
    }
    try {
      return await getProjectExportCapabilitiesWithPermit(message, owner, ports);
    } finally {
      releaseMutationPermit();
    }
  });
}
