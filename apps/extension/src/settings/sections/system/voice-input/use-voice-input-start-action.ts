import { useCallback, type Dispatch, type SetStateAction } from 'react';
import type { MicrophoneAccessState } from '@sniptale/platform/browser/user-media';
import type {
  VoiceInputLocalAvailability,
  VoiceInputPreferences,
} from '@sniptale/runtime-contracts/voice-input';
import type { VoiceInputClient } from '../../../../workflows/voice-input';
import type { VoiceInputSettingsError } from './controller-contract';
import type { VoiceInputOwnerAuthority } from './use-voice-input-owner-lifecycle';

export function useVoiceInputStartAction(args: {
  authority: VoiceInputOwnerAuthority;
  begin(client: VoiceInputClient, preferences: VoiceInputPreferences): string;
  client: VoiceInputClient;
  ensureLocalPackage(availability: VoiceInputLocalAvailability): Promise<void>;
  localAvailability: VoiceInputLocalAvailability;
  preferences: VoiceInputPreferences;
  readMicrophone(): Promise<MicrophoneAccessState>;
  setError: Dispatch<SetStateAction<VoiceInputSettingsError>>;
}): () => Promise<void> {
  const {
    authority,
    begin,
    client,
    ensureLocalPackage,
    localAvailability,
    preferences,
    readMicrophone,
    setError,
  } = args;
  return useCallback(async () => {
    if (authority.startPendingRef.current) return;
    if (authority.microphoneAccessRef.current !== 'granted') {
      setError('permission');
      return;
    }
    const lifecycleGeneration = authority.lifecycleGenerationRef.current;
    const startGeneration = ++authority.startGenerationRef.current;
    authority.startPendingRef.current = true;
    setError(null);
    try {
      if (preferences.mode === 'local-first') await ensureLocalPackage(localAvailability);
      if (
        !authority.mountedRef.current ||
        lifecycleGeneration !== authority.lifecycleGenerationRef.current ||
        startGeneration !== authority.startGenerationRef.current
      ) {
        return;
      }
      const currentMicrophoneAccess = await readMicrophone();
      authority.microphoneAccessRef.current = currentMicrophoneAccess;
      if (
        !authority.mountedRef.current ||
        lifecycleGeneration !== authority.lifecycleGenerationRef.current ||
        startGeneration !== authority.startGenerationRef.current
      ) {
        return;
      }
      if (currentMicrophoneAccess !== 'granted') {
        setError('permission');
        return;
      }
      try {
        begin(client, preferences);
      } catch {
        if (
          authority.mountedRef.current &&
          lifecycleGeneration === authority.lifecycleGenerationRef.current &&
          startGeneration === authority.startGenerationRef.current
        ) {
          setError('runtime');
        }
      }
    } finally {
      if (startGeneration === authority.startGenerationRef.current) {
        authority.startPendingRef.current = false;
      }
    }
  }, [
    authority,
    begin,
    client,
    ensureLocalPackage,
    localAvailability,
    preferences,
    readMicrophone,
    setError,
  ]);
}
