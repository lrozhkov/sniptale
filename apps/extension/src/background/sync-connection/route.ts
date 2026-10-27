import { browserPermissions } from '@sniptale/platform/browser/permissions';
import {
  MessageType,
  type ResponseSender,
} from '@sniptale/runtime-contracts/messaging/message-types';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { parseSyncConnectionRuntimeMessage } from '../../contracts/messaging/contracts/runtime/sync-connection';
import type {
  SyncOriginPermissionRequest,
  SyncOriginPermissionResponse,
} from '../../contracts/messaging/contracts/runtime-message/sync-connection.types';
import {
  sameConnectionBinding,
  sameSyncConnectionIdentity,
  type SyncConnectionMetadata,
} from '../../composition/persistence/remote-connection/model';
import { loadSyncConnection } from '../../composition/persistence/remote-connection/store';
import { hasOffscreenRuntimeCapability } from '../offscreen-document/sender-policy';

interface OriginPermissionDependencies {
  loadConnection(): Promise<SyncConnectionMetadata | null>;
  contains(permissions: chrome.permissions.Permissions): Promise<boolean>;
}
const nativeDependencies: OriginPermissionDependencies = {
  loadConnection: loadSyncConnection,
  contains: (permissions) => browserPermissions.contains(permissions),
};
const REFUSAL = 'Sync origin permission query refused';

function matchesRequest(
  connection: SyncConnectionMetadata | null,
  request: SyncOriginPermissionRequest
): connection is SyncConnectionMetadata {
  if (
    !connection ||
    connection.phase !== 'active' ||
    !sameSyncConnectionIdentity(connection.identity, request.authorization)
  )
    return false;
  const root = new URL(connection.binding.rootUrl);
  return root.protocol === 'https:' && root.origin === request.origin;
}

async function queryPermission(
  request: SyncOriginPermissionRequest,
  deps: OriginPermissionDependencies
): Promise<SyncOriginPermissionResponse> {
  try {
    const before = await deps.loadConnection();
    if (!matchesRequest(before, request)) return { success: true, allowed: false };
    if (!(await deps.contains({ origins: [`${request.origin}/*`] })))
      return { success: true, allowed: false };
    const after = await deps.loadConnection();
    return {
      success: true,
      allowed:
        matchesRequest(after, request) && sameConnectionBinding(before.binding, after.binding),
    };
  } catch {
    return { success: false, error: REFUSAL };
  }
}

/** Read-only IPC: never enter the coordinator queue or the caller-held admission lock. */
export function routeSyncConnectionOriginPermission(
  input: unknown,
  sender: chrome.runtime.MessageSender,
  sendResponse: ResponseSender,
  deps: OriginPermissionDependencies = nativeDependencies
): boolean {
  if (!isRecord(input) || input['type'] !== MessageType.SYNC_CONNECTION_ORIGIN_PERMISSION)
    return false;
  if (sender.tab || !hasOffscreenRuntimeCapability(sender)) {
    sendResponse({ success: false, error: REFUSAL });
    return true;
  }
  let request: SyncOriginPermissionRequest;
  try {
    const parsed = parseSyncConnectionRuntimeMessage(input);
    if (!parsed || parsed.type !== MessageType.SYNC_CONNECTION_ORIGIN_PERMISSION) {
      sendResponse({ success: false, error: REFUSAL });
      return true;
    }
    request = parsed;
  } catch {
    sendResponse({ success: false, error: REFUSAL });
    return true;
  }
  void queryPermission(request, deps).then(sendResponse);
  return true;
}
