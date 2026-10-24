import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from 'react';
import {
  subscribeToMicrophoneAccessChanges,
  type MicrophoneAccessState,
} from '@sniptale/platform/browser/user-media';
import type {
  VoiceInputPreferences,
  VoiceInputServerEvent,
  VoiceInputSnapshot,
} from '@sniptale/runtime-contracts/voice-input';
import { subscribeToVoiceInputPreferencesChanges } from '../../../../composition/persistence/settings';
import type { VoiceInputClient } from '../../../../workflows/voice-input';
import type { VoiceInputSettingsError } from './controller-contract';

export type VoiceInputOwnerAuthority = {
  lifecycleGenerationRef: RefObject<number>;
  microphoneAccessRef: RefObject<MicrophoneAccessState>;
  mountedRef: RefObject<boolean>;
  startGenerationRef: RefObject<number>;
  startPendingRef: RefObject<boolean>;
};

export function useVoiceInputOwnerLifecycle(args: {
  activeSessionIdRef: RefObject<string | null>;
  applyServerEvent(event: VoiceInputServerEvent): void;
  client: VoiceInputClient;
  enabled: boolean;
  setSnapshot: Dispatch<SetStateAction<VoiceInputSnapshot>>;
  cancelSession(): void;
  invalidateCapability(): void;
  microphoneAccess: MicrophoneAccessState;
  refreshCapability(): Promise<void>;
  reconcileVoiceInputPreferences(preferences: VoiceInputPreferences): void;
  setError: Dispatch<SetStateAction<VoiceInputSettingsError>>;
  setMicrophoneAccess: Dispatch<SetStateAction<MicrophoneAccessState>>;
}) {
  const {
    activeSessionIdRef,
    applyServerEvent,
    client,
    enabled,
    setSnapshot,
    cancelSession,
    invalidateCapability,
    microphoneAccess,
    refreshCapability,
    reconcileVoiceInputPreferences,
    setError,
    setMicrophoneAccess,
  } = args;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const mountedRef = useRef(false);
  const lifecycleGenerationRef = useRef(0);
  const startGenerationRef = useRef(0);
  const startPendingRef = useRef(false);
  const microphoneAccessRef = useRef(microphoneAccess);
  microphoneAccessRef.current = microphoneAccess;

  const refresh = useCallback(async () => {
    const lifecycleGeneration = lifecycleGenerationRef.current;
    setError(null);
    await refreshCapability();
    if (!mountedRef.current || lifecycleGeneration !== lifecycleGenerationRef.current) return;
    client.refresh();
  }, [client, refreshCapability, setError]);

  useEffect(() => {
    const lifecycleGeneration = ++lifecycleGenerationRef.current;
    mountedRef.current = true;
    const unsubscribe = client.subscribe((event) => {
      if (
        !enabledRef.current &&
        (!('snapshot' in event) || !['idle', 'ended', 'error'].includes(event.snapshot.phase))
      )
        return;
      applyServerEvent(event);
    });
    const unsubscribeVoicePreferences = subscribeToVoiceInputPreferencesChanges((preferences) => {
      if (!mountedRef.current || lifecycleGeneration !== lifecycleGenerationRef.current) return;
      enabledRef.current = preferences.enabled !== false;
      reconcileVoiceInputPreferences(preferences);
      if (preferences.enabled !== false) return;
      const ownsWork = activeSessionIdRef.current !== null || startPendingRef.current;
      startGenerationRef.current += 1;
      startPendingRef.current = false;
      invalidateCapability();
      setSnapshot((current) => ({
        ...current,
        phase: 'idle',
        sessionId: null,
        busyOwner: null,
        errorCode: null,
      }));
      if (ownsWork) {
        try {
          cancelSession();
        } catch {
          setError('runtime');
        }
      }
    });
    void refresh();
    let unsubscribePermission: () => void = () => undefined;
    void subscribeToMicrophoneAccessChanges((state) => {
      if (!mountedRef.current || lifecycleGeneration !== lifecycleGenerationRef.current) return;
      microphoneAccessRef.current = state;
      setMicrophoneAccess(state);
      if (state !== 'granted') {
        startGenerationRef.current += 1;
        startPendingRef.current = false;
        if (activeSessionIdRef.current) cancelSession();
      }
    }).then((nextUnsubscribe) => {
      if (!mountedRef.current || lifecycleGeneration !== lifecycleGenerationRef.current) {
        nextUnsubscribe();
        return;
      }
      unsubscribePermission = nextUnsubscribe;
    });
    return () => {
      mountedRef.current = false;
      lifecycleGenerationRef.current += 1;
      startGenerationRef.current += 1;
      startPendingRef.current = false;
      invalidateCapability();
      unsubscribePermission();
      unsubscribeVoicePreferences();
      if (activeSessionIdRef.current) {
        try {
          client.cancel(activeSessionIdRef.current);
        } catch {
          /* Disconnect still revokes authority. */
        }
        activeSessionIdRef.current = null;
      }
      unsubscribe();
      client.disconnect();
    };
  }, [
    activeSessionIdRef,
    applyServerEvent,
    client,
    cancelSession,
    invalidateCapability,
    reconcileVoiceInputPreferences,
    refresh,
    setError,
    setMicrophoneAccess,
    setSnapshot,
  ]);

  const authority = useMemo<VoiceInputOwnerAuthority>(
    () => ({
      lifecycleGenerationRef,
      microphoneAccessRef,
      mountedRef,
      startGenerationRef,
      startPendingRef,
    }),
    []
  );

  return {
    authority,
    refresh,
  };
}
