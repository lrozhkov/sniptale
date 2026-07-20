import type { RuntimeMessagingTransport } from '../../../../../platform/runtime-messaging';
import { attachOffscreenCommandCapability } from '@sniptale/platform/security/offscreen-command-capability';
import type {
  VideoProject,
  VideoProjectExportSettings,
} from '../../../../../features/video/project/types';
import {
  loadActiveProjectExportJobLedgerEntry,
  markProjectExportJobTerminal,
  requestProjectExportJobCancel,
  reserveProjectExportJobLedgerEntry,
} from '../../../../../composition/persistence/export-ledger';
import {
  consumeProjectExportCancelCapability,
  issueProjectExportCancelCapability,
  issueProjectExportStartCapability,
} from '../../runtime/export-capabilities';
import {
  ensureOffscreenDocument,
  hasOffscreenDocument,
  waitForOffscreenReady,
} from '../../runtime/offscreen-manager';
import { reconcileProjectExportLedgerAfterOffscreenCreation } from '../../runtime/handlers/export/reconcile';
import { getBackgroundRuntimeMessaging } from '../../../../routing-contracts/runtime-messaging/services';
import {
  deleteProjectExportInput,
  loadProjectExportInput,
} from '../../../../../composition/persistence/project-export-inputs';
import type { ProjectExportInputReference } from '../../../../../contracts/video/types/project-export-input';

export type BackgroundProjectExportPorts = {
  attachOffscreenCommandCapability<T extends { type: string }>(
    message: T
  ):
    | (T & {
        capabilityToken: string;
      })
    | Promise<
        T & {
          capabilityToken: string;
        }
      >;
  consumeProjectExportCancelCapability(args: {
    documentId: string;
    jobId: string;
    senderUrl: string;
    token: string;
  }): Promise<boolean>;
  ensureOffscreenDocument(reason: string): Promise<boolean>;
  deleteProjectExportInput(jobId: string): Promise<void>;
  hasOffscreenDocument(): boolean;
  issueProjectExportCancelCapability(args: {
    documentId: string;
    jobId: string;
    senderUrl: string;
  }): Promise<string>;
  issueProjectExportStartCapability(args: {
    documentId: string;
    jobId: string;
    senderUrl: string;
    settings: VideoProjectExportSettings;
  }): Promise<string>;
  loadActiveProjectExportJobLedgerEntry(): Promise<
    | {
        jobId: string;
        ownerDocumentId?: string | null | undefined;
        ownerSenderUrl?: string | null | undefined;
        status: string;
      }
    | null
    | undefined
  >;
  loadProjectExportInput(reference: ProjectExportInputReference): Promise<VideoProject>;
  markProjectExportJobTerminal(jobId: string, state: 'failed', error: string): Promise<unknown>;
  reconcileProjectExportLedgerAfterOffscreenCreation(created: boolean): Promise<void>;
  requestProjectExportJobCancel(jobId: string): Promise<unknown>;
  reserveProjectExportJobLedgerEntry(args: {
    jobId: string;
    ownerDocumentId: string;
    ownerSenderUrl: string;
    projectId: string;
  }): Promise<unknown>;
  sendRuntimeMessage: RuntimeMessagingTransport['sendRuntimeMessage'];
  waitForOffscreenReady(): Promise<void>;
};

export async function attachProjectExportOffscreenCommandCapability<T extends { type: string }>(
  message: T
): Promise<T & { capabilityToken: string }> {
  return attachOffscreenCommandCapability(message);
}

export function getDefaultBackgroundProjectExportPorts(): BackgroundProjectExportPorts {
  return {
    attachOffscreenCommandCapability: attachProjectExportOffscreenCommandCapability,
    consumeProjectExportCancelCapability,
    deleteProjectExportInput,
    ensureOffscreenDocument,
    hasOffscreenDocument,
    issueProjectExportCancelCapability,
    issueProjectExportStartCapability,
    loadActiveProjectExportJobLedgerEntry,
    loadProjectExportInput,
    markProjectExportJobTerminal,
    reconcileProjectExportLedgerAfterOffscreenCreation,
    requestProjectExportJobCancel,
    reserveProjectExportJobLedgerEntry,
    sendRuntimeMessage: getBackgroundRuntimeMessaging().sendRuntimeMessage,
    waitForOffscreenReady,
  };
}
