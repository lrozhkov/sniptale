import { browserRuntime } from '@sniptale/platform/browser/runtime';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { parseSyncConnectionRuntimeMessage } from '../../contracts/messaging/contracts/runtime/sync-connection';
import { authorizeOffscreenRuntimeCommand } from '../runtime/authorization';
import { executeOffscreenResponseCommand } from '../runtime/idempotency';
import type { createSyncConnectionExecutor } from './executor';

function isSyncCommandCandidate(message: unknown): message is Record<string, unknown> {
  if (!isRecord(message)) return false;
  return (
    message['type'] === MessageType.OFFSCREEN_SYNC_START ||
    message['type'] === MessageType.OFFSCREEN_SYNC_WORKSPACE_START ||
    message['type'] === MessageType.OFFSCREEN_SYNC_INSPECT ||
    message['type'] === MessageType.OFFSCREEN_SYNC_STOP
  );
}

/** Isolate transfer failures from the shared document readiness and media error paths. */
export function registerOffscreenSyncMessageListener(
  executor: ReturnType<typeof createSyncConnectionExecutor>
): () => void {
  return browserRuntime.subscribeToMessages((message: unknown, sender, sendResponse) => {
    if (!isSyncCommandCandidate(message)) return;
    const authorized = authorizeOffscreenRuntimeCommand({
      message,
      sender,
      responseHandler: () =>
        sendResponse({ success: false, error: 'Sync executor command refused' }),
    });
    if (!authorized.authorized) return false;
    const parsed = parseSyncConnectionRuntimeMessage(authorized.message);
    if (
      !parsed ||
      parsed.type === MessageType.SYNC_CONNECTION_ORIGIN_PERMISSION ||
      parsed.type === MessageType.SYNC_WORKSPACE_ORIGIN_PERMISSION
    ) {
      sendResponse({ success: false, error: 'Sync executor command refused' });
      return false;
    }
    try {
      const result = executeOffscreenResponseCommand({
        capabilityGeneration: authorized.capabilityGeneration,
        message: parsed,
        execute: () => {
          if (parsed.type === MessageType.OFFSCREEN_SYNC_START) return executor.start(parsed);
          if (parsed.type === MessageType.OFFSCREEN_SYNC_WORKSPACE_START)
            return executor.startWorkspace(parsed);
          if (parsed.type === MessageType.OFFSCREEN_SYNC_INSPECT) return executor.inspect(parsed);
          return executor.stop(parsed);
        },
      });
      const response = result.duplicate ? result.completion : result.response;
      if (response instanceof Promise) {
        void response.then(sendResponse, () =>
          sendResponse({
            success: false,
            error: 'Sync executor command refused',
          })
        );
        return true;
      }
      sendResponse(response);
    } catch {
      sendResponse({ success: false, error: 'Sync executor command refused' });
    }
    return false;
  });
}
