import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { attachOffscreenCommandCapability } from '@sniptale/platform/security/offscreen-command-capability';
import type { AssetRef } from '../../../../composition/persistence/assets';
import {
  ensureOffscreenDocument,
  waitForOffscreenReady,
} from '../../../offscreen-document/service';
import { getBackgroundRuntimeMessaging } from '../../../routing-contracts/runtime-messaging/services';

type PagePackageDownloadLease = { leaseId: string; url: string };

type PagePackageDownloadOffscreenGateway = {
  confirm(args: { downloadOperationId: string; leaseId: string }): Promise<boolean>;
  create(args: {
    downloadOperationId: string;
    filename: string;
    reference: AssetRef;
  }): Promise<PagePackageDownloadLease>;
  release(args: { downloadOperationId: string; leaseId: string }): Promise<boolean>;
};

export function createPagePackageDownloadOffscreenGateway(): PagePackageDownloadOffscreenGateway {
  const ensureReady = async (): Promise<void> => {
    await ensureOffscreenDocument('Download a saved Page Package');
    await waitForOffscreenReady(5_000);
  };
  return {
    async create(args) {
      await ensureReady();
      const response = await getBackgroundRuntimeMessaging().sendRuntimeMessage(
        attachOffscreenCommandCapability({
          type: MessageType.OFFSCREEN_CREATE_PAGE_PACKAGE_DOWNLOAD_LEASE,
          ...args,
        })
      );
      if (
        response.success !== true ||
        response.result !== 'leased' ||
        typeof response.leaseId !== 'string' ||
        typeof response.url !== 'string'
      ) {
        throw new Error(response.error || 'Offscreen Page Package lease creation failed.');
      }
      return { leaseId: response.leaseId, url: response.url };
    },
    async confirm(args) {
      await ensureReady();
      const response = await getBackgroundRuntimeMessaging().sendRuntimeMessage(
        attachOffscreenCommandCapability({
          type: MessageType.OFFSCREEN_CONFIRM_PAGE_PACKAGE_DOWNLOAD_LEASE,
          ...args,
        })
      );
      if (response.success !== true) {
        throw new Error(response.error || 'Offscreen Page Package lease confirmation failed.');
      }
      return response.result === 'confirmed';
    },
    async release(args) {
      await ensureReady();
      const response = await getBackgroundRuntimeMessaging().sendRuntimeMessage(
        attachOffscreenCommandCapability({
          type: MessageType.OFFSCREEN_RELEASE_PAGE_PACKAGE_DOWNLOAD_LEASE,
          ...args,
        })
      );
      if (response.success !== true) {
        throw new Error(response.error || 'Offscreen Page Package lease release failed.');
      }
      return response.result === 'released' || response.result === 'stale';
    },
  };
}
