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
import type { VoiceInputServerEvent } from '@sniptale/runtime-contracts/voice-input';
import type { VoiceInputClient } from '../../../workflows/voice-input';
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
  invalidateCapability(): void;
  microphoneAccess: MicrophoneAccessState;
  refreshCapability(): Promise<void>;
  setError: Dispatch<SetStateAction<VoiceInputSettingsError>>;
  setMicrophoneAccess: Dispatch<SetStateAction<MicrophoneAccessState>>;
}) {
  const {
    activeSessionIdRef,
    applyServerEvent,
    client,
    invalidateCapability,
    microphoneAccess,
    refreshCapability,
    setError,
    setMicrophoneAccess,
  } = args;
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
    const unsubscribe = client.subscribe(applyServerEvent);
    void refresh();
    let unsubscribePermission: () => void = () => undefined;
    void subscribeToMicrophoneAccessChanges((state) => {
      if (!mountedRef.current || lifecycleGeneration !== lifecycleGenerationRef.current) return;
      microphoneAccessRef.current = state;
      setMicrophoneAccess(state);
      if (state !== 'granted') {
        startGenerationRef.current += 1;
        startPendingRef.current = false;
        if (activeSessionIdRef.current) client.stop(activeSessionIdRef.current);
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
      unsubscribe();
      client.disconnect();
    };
  }, [
    activeSessionIdRef,
    applyServerEvent,
    client,
    invalidateCapability,
    refresh,
    setMicrophoneAccess,
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
