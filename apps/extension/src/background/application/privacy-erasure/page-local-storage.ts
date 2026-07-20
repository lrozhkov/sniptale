import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { attachOffscreenCommandCapability } from '@sniptale/platform/security/offscreen-command-capability';
import { getBackgroundRuntimeMessaging } from '../../routing-contracts/runtime-messaging/services';
import {
  closeOffscreenDocumentForPrivacyErasure,
  ensurePrivacyErasureOffscreenDocument,
} from '../../media/video/runtime/offscreen-manager';

async function runPageStorageCommand(
  operation: 'erase' | 'verify',
  options: { preservePreferences: boolean }
): Promise<{ empty: boolean; removedCount: number }> {
  const response = await getBackgroundRuntimeMessaging().sendRuntimeMessage(
    attachOffscreenCommandCapability({
      type: MessageType.OFFSCREEN_PRIVACY_ERASURE_PAGE_STORAGE,
      operation,
      preservePreferences: options.preservePreferences,
    })
  );
  if (response.success !== true || response.empty !== true) {
    throw new Error('Extension page local storage erasure failed');
  }
  return { empty: response.empty, removedCount: response.removedCount ?? 0 };
}

export const extensionPageLocalStorageErasureAdapter = {
  async erase(options: { preservePreferences: boolean }): Promise<number> {
    return (await runPageStorageCommand('erase', options)).removedCount;
  },
  prepare: ensurePrivacyErasureOffscreenDocument,
  release: closeOffscreenDocumentForPrivacyErasure,
  async verifyEmpty(options: { preservePreferences: boolean }): Promise<boolean> {
    return (await runPageStorageCommand('verify', options)).empty;
  },
};
