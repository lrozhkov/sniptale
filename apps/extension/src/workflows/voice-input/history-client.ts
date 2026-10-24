import { browserRuntime } from '@sniptale/platform/browser/runtime';
import {
  parseVoiceHistoryServerEvent,
  VOICE_INPUT_HISTORY_PORT_NAME,
  type VoiceHistoryEntry,
  type VoiceHistoryRequest,
  type VoiceHistoryScope,
  type VoiceHistoryServerEvent,
} from '@sniptale/runtime-contracts/voice-input';

type Progress = Extract<VoiceHistoryServerEvent, { type: 'progress' }>;
type Pending = {
  request: VoiceHistoryRequest;
  resolve(event: VoiceHistoryServerEvent): void;
  reject(error: Error): void;
  progress?: (event: Progress) => void;
};

/** Selects only the public CAS identity; full entries are forbidden on this Port. */
export function voiceHistoryScope(entry: VoiceHistoryScope): VoiceHistoryScope {
  return {
    entryId: entry.entryId,
    incarnation: entry.incarnation,
    epoch: entry.epoch,
    revision: entry.revision,
    audioDigest: entry.audioDigest,
  };
}

/** Settings metadata transport. Audio is read separately by the persistence owner. */
export function createVoiceInputHistoryClient(
  deps: {
    connect?: () => chrome.runtime.Port;
    createId?: () => string;
  } = {}
) {
  let port: chrome.runtime.Port | null = null;
  let disposed = false;
  const pending = new Map<string, Pending>();
  const createId = deps.createId ?? (() => crypto.randomUUID());

  function rejectPending(): void {
    for (const item of pending.values()) item.reject(new Error('offscreen-unavailable'));
    pending.clear();
  }
  function receive(raw: unknown): void {
    const event = parseVoiceHistoryServerEvent(raw);
    if (!event) return;
    const item = pending.get(event.requestId);
    if (!item) return;
    if (event.type === 'progress') {
      if (item.request.type !== 'retry' || !matches(item.request.scope, event.scope)) return;
      item.request.scope = event.scope;
      item.progress?.(event);
      return;
    }
    const request = item.request;
    if (event.type === 'failure') {
      pending.delete(event.requestId);
      item.reject(new Error(event.code));
      return;
    }
    if (
      (request.type === 'list' && event.type === 'list') ||
      (request.type === 'retry' && event.type === 'entry' && matches(request.scope, event.entry)) ||
      (request.type === 'delete' && event.type === 'deleted' && matches(request.scope, event.scope))
    ) {
      pending.delete(event.requestId);
      item.resolve(event);
    }
  }
  function matches(left: VoiceHistoryScope, right: VoiceHistoryScope): boolean {
    return (
      left.entryId === right.entryId &&
      left.incarnation === right.incarnation &&
      left.epoch === right.epoch &&
      left.audioDigest === right.audioDigest &&
      right.revision >= left.revision
    );
  }
  function request(command: VoiceHistoryRequest, progress?: Pending['progress']) {
    return new Promise<VoiceHistoryServerEvent>((resolve, reject) => {
      if (disposed) {
        reject(new Error('offscreen-unavailable'));
        return;
      }
      try {
        if (!port) {
          const connection = (
            deps.connect ?? (() => browserRuntime.connect({ name: VOICE_INPUT_HISTORY_PORT_NAME }))
          )();
          port = connection;
          connection.onMessage.addListener(receive);
          connection.onDisconnect.addListener(() => {
            if (port !== connection) return;
            port = null;
            rejectPending();
          });
        }
        pending.set(command.requestId, {
          request: command,
          resolve,
          reject,
          ...(progress === undefined ? {} : { progress }),
        });
        port.postMessage(command);
      } catch {
        pending.delete(command.requestId);
        reject(new Error('offscreen-unavailable'));
      }
    });
  }
  return {
    async list(): Promise<VoiceHistoryEntry[]> {
      const event = await request({ type: 'list', requestId: createId() });
      if (event.type !== 'list') throw new Error('invalid-response');
      return event.entries;
    },
    async retry(
      scope: VoiceHistoryScope,
      progress?: Pending['progress']
    ): Promise<VoiceHistoryEntry> {
      const event = await request(
        { type: 'retry', requestId: createId(), scope: voiceHistoryScope(scope) },
        progress
      );
      if (event.type !== 'entry') throw new Error('invalid-response');
      return event.entry;
    },
    async remove(scope: VoiceHistoryScope): Promise<void> {
      await request({ type: 'delete', requestId: createId(), scope: voiceHistoryScope(scope) });
    },
    disconnect(): void {
      disposed = true;
      rejectPending();
      port?.onMessage.removeListener(receive);
      port?.disconnect();
      port = null;
    },
  };
}

export type VoiceInputHistoryClient = ReturnType<typeof createVoiceInputHistoryClient>;
