import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { attachOffscreenCommandCapability } from '@sniptale/platform/security/offscreen-command-capability';
import type { AssetRef } from '../../../../composition/persistence/assets';
import {
  ensureOffscreenDocument,
  waitForOffscreenReady,
} from '../../../offscreen-document/service';
import { getBackgroundRuntimeMessaging } from '../../../routing-contracts/runtime-messaging/services';

type PagePackageDownloadLease = { leaseId: string; url: string };
const OFFSCREEN_READY_TIMEOUT_MS = 5_000;
type PagePackageDownloadOffscreenGateway = {
  confirm(args: {
    downloadOperationId: string;
    leaseId: string;
    signal: AbortSignal;
  }): Promise<boolean>;
  create(args: {
    downloadOperationId: string;
    filename: string;
    downloadFormat?: 'html';
    reference: AssetRef;
    signal: AbortSignal;
  }): Promise<PagePackageDownloadLease>;
  release(args: { downloadOperationId: string; leaseId: string }): Promise<boolean>;
};

export function createPagePackageDownloadOffscreenGateway(): PagePackageDownloadOffscreenGateway {
  const ensureReady = async (signal?: AbortSignal): Promise<void> => {
    await ensureOffscreenDocument('Download a saved Page Package');
    await waitForOffscreenReady(OFFSCREEN_READY_TIMEOUT_MS, signal);
  };
  return {
    async create(args) {
      await ensureReady(args.signal);
      const response = await getBackgroundRuntimeMessaging().sendRuntimeMessage(
        attachOffscreenCommandCapability({
          type: MessageType.OFFSCREEN_CREATE_PAGE_PACKAGE_DOWNLOAD_LEASE,
          downloadOperationId: args.downloadOperationId,
          filename: args.filename,
          ...(args.downloadFormat ? { downloadFormat: args.downloadFormat } : {}),
          reference: args.reference,
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
      await ensureReady(args.signal);
      const response = await getBackgroundRuntimeMessaging().sendRuntimeMessage(
        attachOffscreenCommandCapability({
          type: MessageType.OFFSCREEN_CONFIRM_PAGE_PACKAGE_DOWNLOAD_LEASE,
          downloadOperationId: args.downloadOperationId,
          leaseId: args.leaseId,
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

/** Prepare the current offscreen data connection before any export publication lease is held. */
export async function preparePagePackageDownloadRuntime(signal: AbortSignal): Promise<void> {
  const deadline = new AbortController();
  const preparationSignal = AbortSignal.any([signal, deadline.signal]);
  const timeout = setTimeout(
    () => deadline.abort(new Error('Page Package download preparation timed out.')),
    30_000
  );
  let removeAbortListener: () => void = () => undefined;
  const cancelled = new Promise<never>((_, reject) => {
    const abort = () => reject(preparationSignal.reason);
    if (preparationSignal.aborted) abort();
    else {
      preparationSignal.addEventListener('abort', abort, { once: true });
      removeAbortListener = () => preparationSignal.removeEventListener('abort', abort);
    }
  });
  const prepare = async () => {
    preparationSignal.throwIfAborted();
    await ensureOffscreenDocument('Prepare a Page Package download');
    preparationSignal.throwIfAborted();
    await waitForOffscreenReady(OFFSCREEN_READY_TIMEOUT_MS, preparationSignal);
    preparationSignal.throwIfAborted();
    const response = await getBackgroundRuntimeMessaging().sendRuntimeMessage(
      attachOffscreenCommandCapability({
        type: MessageType.OFFSCREEN_PREPARE_PAGE_PACKAGE_DOWNLOAD,
      })
    );
    if (response.success !== true || response.result !== 'accepted') {
      throw new Error(response.error || 'Offscreen Page Package preparation failed.');
    }
  };
  try {
    await Promise.race([prepare(), cancelled]);
  } finally {
    clearTimeout(timeout);
    removeAbortListener();
  }
}
