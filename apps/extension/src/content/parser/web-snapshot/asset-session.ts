import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { getContentRuntimeServices } from '../../platform/runtime-services/services';

export async function requestWebSnapshotAssetSession(
  assetUrls: string[],
  requestId: string
): Promise<string> {
  const response = await getContentRuntimeServices().messaging.sendRuntimeMessage({
    type: MessageType.REGISTER_WEB_SNAPSHOT_ASSETS,
    assetUrls,
    requestId,
  });
  if (!response.success || !response.snapshotSessionId) {
    throw new Error(response.error || 'web snapshot asset registration failed');
  }

  return response.snapshotSessionId;
}

export async function extendWebSnapshotAssetSession(
  assetUrls: string[],
  requestId: string,
  snapshotSessionId: string
): Promise<void> {
  if (assetUrls.length === 0) return;
  const response = await getContentRuntimeServices().messaging.sendRuntimeMessage({
    type: MessageType.REGISTER_WEB_SNAPSHOT_ASSETS,
    assetUrls,
    requestId,
    snapshotSessionId,
  });
  if (!response.success || response.snapshotSessionId !== snapshotSessionId) {
    throw new Error(response.error || 'web snapshot asset session expansion failed');
  }
}

export function formatWebSnapshotWarningUrl(url: string, baseUrl?: string): string {
  try {
    const fallbackBaseUrl = typeof document === 'undefined' ? undefined : document.baseURI;
    const parsedUrl = new URL(url, baseUrl ?? fallbackBaseUrl);
    return `${parsedUrl.origin}${parsedUrl.pathname}`;
  } catch {
    return url;
  }
}
