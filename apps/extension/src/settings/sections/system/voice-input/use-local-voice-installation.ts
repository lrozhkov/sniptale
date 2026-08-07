import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { installSpeechRecognitionLanguage } from '@sniptale/platform/browser/speech-recognition';
import { createLogger } from '@sniptale/platform/observability/logger';
import {
  VOICE_INPUT_LOCAL_QUALITY,
  type VoiceInputLanguage,
  type VoiceInputLocalAvailability,
  type VoiceInputSnapshot,
} from '@sniptale/runtime-contracts/voice-input';
import type { VoiceInputSettingsError } from './controller-contract';
import { withTimeout } from './async';

const logger = createLogger({ namespace: 'SettingsSpeechRecognition' });
const INSTALL_TIMEOUT_MS = 90_000;
const INSTALL_POLL_INTERVAL_MS = 500;

function waitForDelay(timeoutMs: number): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, timeoutMs));
}

export function useLocalVoiceInstallation(args: {
  language: VoiceInputLanguage;
  refreshAvailability(): Promise<VoiceInputLocalAvailability>;
  setError: Dispatch<SetStateAction<VoiceInputSettingsError>>;
  setSnapshot: Dispatch<SetStateAction<VoiceInputSnapshot>>;
}) {
  const { language, refreshAvailability, setError, setSnapshot } = args;
  const [installing, setInstalling] = useState(false);
  const installGenerationRef = useRef(0);

  const installPackage = useCallback(async () => {
    const installGeneration = ++installGenerationRef.current;
    const startedAt = performance.now();
    setInstalling(true);
    setSnapshot((current) => ({ ...current, phase: 'installing' }));
    setError(null);
    const installWork = installSpeechRecognitionLanguage(language);
    try {
      const installed = await withTimeout(installWork, INSTALL_TIMEOUT_MS);
      if (installGeneration !== installGenerationRef.current) return;
      const availability = await refreshAvailability();
      if (installGeneration !== installGenerationRef.current) return;
      if (!installed || availability !== 'available') setError('install');
      logger.debug('Voice input dictation package installation completed', {
        availability,
        installed,
        language,
        quality: VOICE_INPUT_LOCAL_QUALITY,
        durationMs: Math.round(performance.now() - startedAt),
      });
    } catch {
      if (installGeneration !== installGenerationRef.current) return;
      setError('install');
      logger.warn('Voice input dictation package installation failed', {
        durationMs: Math.round(performance.now() - startedAt),
        language,
        quality: VOICE_INPUT_LOCAL_QUALITY,
      });
    } finally {
      if (installGeneration === installGenerationRef.current) {
        setInstalling(false);
        setSnapshot((current) =>
          current.phase === 'installing' ? { ...current, phase: 'idle' } : current
        );
      }
    }
  }, [language, refreshAvailability, setError, setSnapshot]);

  const ensureLocalPackage = useCallback(
    async (availability: VoiceInputLocalAvailability) => {
      if (availability === 'downloadable') {
        await installPackage();
        return;
      }
      if (availability !== 'downloading') return;
      const installGeneration = ++installGenerationRef.current;
      setInstalling(true);
      const deadline = Date.now() + INSTALL_TIMEOUT_MS;
      let currentAvailability: VoiceInputLocalAvailability = 'downloading';
      while (
        installGeneration === installGenerationRef.current &&
        currentAvailability === 'downloading' &&
        Date.now() < deadline
      ) {
        await waitForDelay(INSTALL_POLL_INTERVAL_MS);
        if (installGeneration !== installGenerationRef.current) return;
        currentAvailability = await refreshAvailability();
      }
      if (installGeneration !== installGenerationRef.current) return;
      setInstalling(false);
      if (currentAvailability !== 'available') setError('install');
    },
    [installPackage, refreshAvailability, setError]
  );

  const invalidateInstallation = useCallback(() => {
    installGenerationRef.current += 1;
    setInstalling(false);
  }, []);

  return {
    ensureLocalPackage,
    installPackage,
    installing,
    invalidateInstallation,
  };
}
