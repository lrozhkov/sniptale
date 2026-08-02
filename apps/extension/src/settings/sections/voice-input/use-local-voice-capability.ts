import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { loadSpeechRecognitionAvailability } from '@sniptale/platform/browser/speech-recognition';
import { createLogger } from '@sniptale/platform/observability/logger';
import {
  VOICE_INPUT_LOCAL_QUALITY,
  type VoiceInputLanguage,
  type VoiceInputLocalAvailability,
  type VoiceInputMode,
  type VoiceInputSnapshot,
} from '@sniptale/runtime-contracts/voice-input';
import type { VoiceInputSettingsError } from './controller-contract';
import { useLocalVoiceInstallation } from './use-local-voice-installation';
import { useMicrophoneCapability } from './use-microphone-capability';

// policyStateIds: [] - Settings-local generations only discard stale browser capability probes;
// they grant no runtime, microphone, or recognition authority.

const logger = createLogger({ namespace: 'SettingsSpeechRecognition' });

function withTimeout<TValue>(work: Promise<TValue>, timeoutMs: number): Promise<TValue> {
  return new Promise((resolve, reject) => {
    const timeoutId = globalThis.setTimeout(
      () => reject(new Error('voice-input-timeout')),
      timeoutMs
    );
    void work.then(
      (value) => {
        globalThis.clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        globalThis.clearTimeout(timeoutId);
        reject(error);
      }
    );
  });
}

export function useLocalVoiceCapability(args: {
  language: VoiceInputLanguage;
  mode: VoiceInputMode;
  setError: Dispatch<SetStateAction<VoiceInputSettingsError>>;
  setSnapshot: Dispatch<SetStateAction<VoiceInputSnapshot>>;
}) {
  const { language, mode, setError, setSnapshot } = args;
  const [checking, setChecking] = useState(false);
  const capabilityGenerationRef = useRef(0);
  const availabilityGenerationRef = useRef(0);
  const microphone = useMicrophoneCapability();
  const {
    invalidate: invalidateMicrophone,
    read: readMicrophone,
    refresh: refreshMicrophone,
    refreshDevices: refreshMicrophones,
    request: requestMicrophoneAccess,
    setAccess: setMicrophoneAccess,
  } = microphone.actions;

  const refreshAvailability = useCallback(async (): Promise<VoiceInputLocalAvailability> => {
    const capabilityGeneration = capabilityGenerationRef.current;
    const generation = ++availabilityGenerationRef.current;
    const startedAt = performance.now();
    setChecking(true);
    setSnapshot((current) => ({ ...current, phase: 'checking' }));
    try {
      const result = await withTimeout(
        loadSpeechRecognitionAvailability({ language, processLocally: true }),
        5_000
      );
      if (
        capabilityGeneration !== capabilityGenerationRef.current ||
        generation !== availabilityGenerationRef.current
      ) {
        return 'unknown';
      }
      setSnapshot((current) => ({
        ...current,
        apiFlavor: result.apiFlavor,
        language,
        localAvailability: result.availability,
        qualitySupported: result.qualitySupported,
        durationMs: Math.round(performance.now() - startedAt),
        requestedMode: mode,
      }));
      logger.debug('Refreshed voice input availability', {
        apiFlavor: result.apiFlavor,
        availability: result.availability,
        language,
        quality: VOICE_INPUT_LOCAL_QUALITY,
        qualitySupported: result.qualitySupported,
      });
      return result.availability;
    } catch {
      if (
        capabilityGeneration === capabilityGenerationRef.current &&
        generation === availabilityGenerationRef.current
      ) {
        setSnapshot((current) => ({ ...current, localAvailability: 'unknown' }));
      }
      logger.warn('Voice input availability check failed', {
        durationMs: Math.round(performance.now() - startedAt),
        language,
        quality: VOICE_INPUT_LOCAL_QUALITY,
      });
      return 'unknown';
    } finally {
      if (
        capabilityGeneration === capabilityGenerationRef.current &&
        generation === availabilityGenerationRef.current
      ) {
        setChecking(false);
        setSnapshot((current) =>
          current.phase === 'checking' ? { ...current, phase: 'idle' } : current
        );
      }
    }
  }, [language, mode, setSnapshot]);

  const refresh = useCallback(async () => {
    await Promise.all([refreshMicrophone(), refreshAvailability()]);
  }, [refreshAvailability, refreshMicrophone]);

  const requestMicrophone = useCallback(
    async (deviceId: string | null = null) => {
      setError(null);
      const state = await requestMicrophoneAccess(deviceId);
      logger.debug('Microphone permission request completed', { state });
      if (state !== 'granted') {
        setError('permission');
        return;
      }
      await refreshAvailability();
    },
    [refreshAvailability, requestMicrophoneAccess, setError]
  );

  const installation = useLocalVoiceInstallation({
    language,
    refreshAvailability,
    setError,
    setSnapshot,
  });
  const { invalidateInstallation } = installation;

  const invalidateCapability = useCallback(() => {
    capabilityGenerationRef.current += 1;
    availabilityGenerationRef.current += 1;
    invalidateMicrophone();
    invalidateInstallation();
  }, [invalidateInstallation, invalidateMicrophone]);

  return {
    actions: {
      ensureLocalPackage: installation.ensureLocalPackage,
      installPackage: installation.installPackage,
      invalidateCapability,
      readMicrophone,
      refresh,
      refreshMicrophones,
      requestMicrophone,
      setMicrophoneAccess,
    },
    state: {
      checking,
      installing: installation.installing,
      microphoneAccess: microphone.state.access,
      microphones: microphone.state.devices,
      microphonesLoading: microphone.state.loading,
    },
  };
}
