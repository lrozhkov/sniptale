import type { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { ResponseSender } from '@sniptale/runtime-contracts/messaging/message-types';
import type { parseOffscreenRuntimeMessage } from '../../contracts/messaging/parsers/boundary';
import {
  eraseExtensionPageLocalStorage,
  verifyExtensionPageLocalStorageErased,
} from '../../composition/persistence/privacy-erasure/page-local-storage';

type PageStoragePrivacyErasureMessage = Extract<
  ReturnType<typeof parseOffscreenRuntimeMessage>,
  { type: typeof MessageType.OFFSCREEN_PRIVACY_ERASURE_PAGE_STORAGE }
>;

export function handlePageStoragePrivacyErasure(
  message: PageStoragePrivacyErasureMessage,
  sendResponse?: ResponseSender
): void {
  const storage = window.localStorage;
  const options = { preservePreferences: message.preservePreferences };
  const removedKeys =
    message.operation === 'erase' ? eraseExtensionPageLocalStorage(storage, options) : [];
  const empty = verifyExtensionPageLocalStorageErased(storage, options);
  if (!empty) {
    throw new Error('Extension page local storage erasure verification failed');
  }
  sendResponse?.({
    success: true,
    empty,
    ...(message.operation === 'erase' ? { removedCount: removedKeys.length } : {}),
  });
}
