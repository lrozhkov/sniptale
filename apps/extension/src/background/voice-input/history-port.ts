import {
  VOICE_INPUT_HISTORY_PORT_NAME,
  parseVoiceHistoryRequest,
  type VoiceHistoryServerEvent,
  type VoiceInputPreferences,
} from '@sniptale/runtime-contracts/voice-input';
import type { VoiceInputHistory } from '../../composition/persistence/voice-input-history';
import { resolveExtensionDocumentSenderUrl } from '../../platform/runtime-messaging/document-sender';
import {
  voiceProcessingErrorCode,
  type VoiceInputProcessingOperations,
} from './processing-operation';

/** Settings controls metadata only. Audio stays in the private history owner. */
export function createVoiceInputHistoryPort(deps: {
  history: VoiceInputHistory;
  processing: VoiceInputProcessingOperations;
  loadPreferences(): Promise<VoiceInputPreferences>;
}) {
  function registerPort(port: chrome.runtime.Port): void {
    if (port.name !== VOICE_INPUT_HISTORY_PORT_NAME) return;
    if (
      !port.sender?.documentId ||
      port.sender.frameId !== 0 ||
      !resolveExtensionDocumentSenderUrl(port.sender, 'apps/extension/src/settings/index.html')
    ) {
      port.disconnect();
      return;
    }
    let connected = true;
    const requests = new Set<string>();
    const post = (event: VoiceHistoryServerEvent) => {
      if (!connected) return;
      try {
        port.postMessage(event);
      } catch {
        /* Disconnected Settings has no delivery target. */
      }
    };
    const onMessage = (raw: unknown) => {
      const request = parseVoiceHistoryRequest(raw);
      if (!request || requests.has(request.requestId)) return;
      if (requests.size >= 32) {
        post({ type: 'failure', requestId: request.requestId, code: 'busy-speech' });
        return;
      }
      requests.add(request.requestId);
      void (async () => {
        if (request.type === 'list') {
          post({ type: 'list', requestId: request.requestId, entries: await deps.history.list() });
        } else if (request.type === 'delete') {
          const scope = await deps.processing.cancelScope(request.scope);
          await deps.history.remove(scope);
          post({ type: 'deleted', requestId: request.requestId, scope: request.scope });
        } else {
          const preferences = await deps.loadPreferences();
          if (!connected) return;
          if (!preferences.transcription) throw new Error('model-unavailable');
          const entry = await deps.processing.run({
            owner: port,
            scope: request.scope,
            preferences: { ...preferences, backend: 'model' },
            onPhase: (phase, scope) =>
              post({ type: 'progress', requestId: request.requestId, phase, scope }),
          });
          post({ type: 'entry', requestId: request.requestId, entry });
        }
      })()
        .catch((error: unknown) =>
          post({
            type: 'failure',
            requestId: request.requestId,
            code: voiceProcessingErrorCode(error),
          })
        )
        .finally(() => requests.delete(request.requestId));
    };
    const onDisconnect = () => {
      connected = false;
      port.onMessage.removeListener(onMessage);
      port.onDisconnect.removeListener(onDisconnect);
      void deps.processing.cancelOwner(port);
    };
    port.onMessage.addListener(onMessage);
    port.onDisconnect.addListener(onDisconnect);
  }
  return { registerPort };
}
