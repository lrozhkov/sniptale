import { defaultVideoPreviewCacheDatabase } from './database';

export async function eraseVideoPreviewCacheForPrivacyErasure(): Promise<void> {
  await defaultVideoPreviewCacheDatabase.close();
  await defaultVideoPreviewCacheDatabase.deleteDatabase();
}

export function verifyVideoPreviewCacheEmptyAfterPrivacyErasure(): Promise<boolean> {
  return defaultVideoPreviewCacheDatabase.verifyAbsent();
}
