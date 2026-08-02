import { browserRuntime } from '@sniptale/platform/browser/runtime';
import { createLogger } from '@sniptale/platform/observability/logger';
import {
  parseVoiceInputServerEvent,
  VOICE_INPUT_PORT_NAME,
  VoiceInputPortMessageType,
  VOICE_INPUT_LOCAL_QUALITY,
  type VoiceInputPreferences,
  type VoiceInputServerEvent,
} from '@sniptale/runtime-contracts/voice-input';

const logger = createLogger({ namespace: 'VoiceInputClient' });
const SESSION_RECONCILIATION_INITIAL_DELAY_MS = 1_500;
const SESSION_RECONCILIATION_INTERVAL_MS = 2_000;

export type VoiceInputClientListener = (event: VoiceInputServerEvent) => void;

export interface VoiceInputClient {
  disconnect(): void;
  refresh(): string;
  start(preferences: VoiceInputPreferences): string;
  stop(sessionId: string): string;
  subscribe(listener: VoiceInputClientListener): () => void;
}

type VoiceInputClientDeps = {
  connect(): chrome.runtime.Port;
  createId(): string;
  schedule(callback: () => void, delayMs: number): void;
};

const defaultDeps: VoiceInputClientDeps = {
  connect: () => browserRuntime.connect({ name: VOICE_INPUT_PORT_NAME }),
  createId: () => {
    const randomUUID = globalThis.crypto?.randomUUID;
    if (!randomUUID) throw new Error('Voice input identity generation is unavailable.');
    return randomUUID.call(globalThis.crypto);
  },
  schedule: (callback, delayMs) => {
    globalThis.setTimeout(callback, delayMs);
  },
};

export function createVoiceInputClient(deps: Partial<VoiceInputClientDeps> = {}): VoiceInputClient {
  const resolvedDeps = { ...defaultDeps, ...deps };
  const listeners = new Set<VoiceInputClientListener>();
  let port: chrome.runtime.Port | null = null;
  let activeSessionId: string | null = null;
  let disposed = false;
  let lastPreferences: VoiceInputPreferences = {
    language: 'ru-RU',
    microphoneDeviceId: null,
    mode: 'local-first',
  };

  function emitRuntimeFailure(sessionId: string): void {
    emit({
      errorCode: 'offscreen-unavailable',
      sessionId,
      snapshot: {
        apiFlavor: 'unsupported',
        busyOwner: null,
        effectiveMode: null,
        errorCode: 'offscreen-unavailable',
        fallbackReason: null,
        language: lastPreferences.language,
        localAvailability: 'unknown',
        phase: 'error',
        quality: VOICE_INPUT_LOCAL_QUALITY,
        qualitySupported: false,
        requestedMode: lastPreferences.mode,
        sessionId,
      },
      type: VoiceInputPortMessageType.FAILURE,
    });
  }

  function emit(rawEvent: unknown): void {
    const event = parseVoiceInputServerEvent(rawEvent);
    if (!event) {
      logger.warn('Ignored invalid voice input port event');
      return;
    }
    const terminalSessionId =
      event.type === VoiceInputPortMessageType.TRANSCRIPT ||
      event.type === VoiceInputPortMessageType.AUDIO_LEVEL
        ? null
        : event.type === VoiceInputPortMessageType.FAILURE
          ? (event.sessionId ?? event.snapshot.sessionId)
          : event.snapshot.phase === 'idle' && event.snapshot.sessionId === null
            ? activeSessionId
            : event.snapshot.phase === 'ended' || event.snapshot.phase === 'error'
              ? event.snapshot.sessionId
              : null;
    if (activeSessionId !== null && terminalSessionId === activeSessionId) {
      activeSessionId = null;
    }
    for (const listener of listeners) listener(event);
  }

  function ensurePort(): chrome.runtime.Port {
    if (port) return port;
    const nextPort = resolvedDeps.connect();
    port = nextPort;
    nextPort.onMessage.addListener(emit);
    nextPort.onDisconnect.addListener(() => {
      if (port !== nextPort) return;
      port = null;
      logger.warn('Voice input port disconnected');
      if (activeSessionId) emitRuntimeFailure(activeSessionId);
      if (!disposed) {
        resolvedDeps.schedule(() => {
          if (disposed || port) return;
          try {
            const requestId = resolvedDeps.createId();
            postMessage({ type: VoiceInputPortMessageType.STATUS, requestId });
          } catch {
            logger.warn('Voice input Port reconciliation failed');
          }
        }, 250);
      }
    });
    logger.debug('Voice input port connected');
    return nextPort;
  }

  function postMessage(message: unknown): void {
    try {
      ensurePort().postMessage(message);
    } catch {
      port = null;
      logger.warn('Failed to post voice input port message');
      throw new Error('Voice input runtime is unavailable.');
    }
  }

  function scheduleSessionReconciliation(sessionId: string, delayMs: number): void {
    resolvedDeps.schedule(() => {
      if (disposed || activeSessionId !== sessionId) return;
      try {
        postMessage({
          requestId: resolvedDeps.createId(),
          type: VoiceInputPortMessageType.STATUS,
        });
        scheduleSessionReconciliation(sessionId, SESSION_RECONCILIATION_INTERVAL_MS);
      } catch {
        if (activeSessionId === sessionId) emitRuntimeFailure(sessionId);
      }
    }, delayMs);
  }

  return {
    disconnect() {
      disposed = true;
      const currentPort = port;
      port = null;
      currentPort?.disconnect();
    },
    refresh() {
      disposed = false;
      const requestId = resolvedDeps.createId();
      postMessage({ type: VoiceInputPortMessageType.STATUS, requestId });
      return requestId;
    },
    start(preferences) {
      disposed = false;
      if (activeSessionId) {
        logger.warn('Ignored duplicate voice input start', { sessionId: activeSessionId });
        return activeSessionId;
      }
      const requestId = resolvedDeps.createId();
      const sessionId = resolvedDeps.createId();
      activeSessionId = sessionId;
      lastPreferences = preferences;
      try {
        postMessage({
          type: VoiceInputPortMessageType.START,
          preferences,
          requestId,
          sessionId,
        });
      } catch (error) {
        if (activeSessionId === sessionId) activeSessionId = null;
        throw error;
      }
      scheduleSessionReconciliation(sessionId, SESSION_RECONCILIATION_INITIAL_DELAY_MS);
      return sessionId;
    },
    stop(sessionId) {
      const requestId = resolvedDeps.createId();
      postMessage({ type: VoiceInputPortMessageType.STOP, requestId, sessionId });
      return requestId;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
