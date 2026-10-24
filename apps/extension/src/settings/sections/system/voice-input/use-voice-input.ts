import { useCallback, useMemo, useState } from 'react';
import {
  resolveVoiceInputPreferences,
  type VoiceInputPreferences,
} from '@sniptale/runtime-contracts/voice-input';
import { useVoiceModelSelection } from './use-voice-model-selection';
import { createVoiceInputClient, type VoiceInputClient } from '../../../../workflows/voice-input';
import { useSettingsStore } from '../../../runtime/store/useSettingsStore';
import type { VoiceInputSettingsController, VoiceInputSettingsError } from './controller-contract';
import { useLocalVoiceCapability } from './use-local-voice-capability';
import { useVoiceInputSessionState } from './use-voice-input-session';
import { useVoiceInputOwnerLifecycle } from './use-voice-input-owner-lifecycle';
import { useVoiceInputStartAction } from './use-voice-input-start-action';

export function useVoiceInputSettings(
  createClient: () => VoiceInputClient = createVoiceInputClient
): VoiceInputSettingsController {
  const { settings, updateSettings } = useSettingsStore();
  const preferences = useMemo(
    () =>
      resolveVoiceInputPreferences(
        settings.voiceInput ?? {
          language: 'ru-RU',
          microphoneDeviceId: null,
          mode: 'local-first',
        }
      ),
    [settings.voiceInput]
  );
  const client = useMemo(createClient, [createClient]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<VoiceInputSettingsError>(null);
  const onRuntimeFailure = useCallback(() => setError('runtime'), []);
  const voiceSession = useVoiceInputSessionState({
    initialLanguage: preferences.language,
    initialMode: preferences.mode,
    onRuntimeFailure,
  });
  const {
    activeSessionIdRef,
    applyServerEvent,
    begin,
    stop: stopSession,
    cancel: cancelSession,
  } = voiceSession.connection;
  const { audioLevel, audioPeaks, setSnapshot, snapshot } = voiceSession.snapshotState;
  const cancelOwnedSession = useCallback(() => cancelSession(client), [cancelSession, client]);
  const capability = useLocalVoiceCapability({
    language: preferences.language,
    mode: preferences.mode,
    backend: preferences.backend,
    setError,
    setSnapshot,
  });
  const {
    ensureLocalPackage,
    installPackage,
    invalidateCapability,
    readMicrophone,
    refresh: refreshCapability,
    requestMicrophone,
    setMicrophoneAccess,
  } = capability.actions;
  const { checking, installing, microphoneAccess, microphones, microphonesLoading } =
    capability.state;
  const { authority, refresh } = useVoiceInputOwnerLifecycle({
    activeSessionIdRef,
    applyServerEvent,
    client,
    cancelSession: cancelOwnedSession,
    invalidateCapability,
    microphoneAccess,
    refreshCapability,
    setError,
    setMicrophoneAccess,
  });
  const start = useVoiceInputStartAction({
    authority,
    begin,
    client,
    ensureLocalPackage,
    localAvailability: snapshot.localAvailability,
    preferences,
    readMicrophone,
    setError,
  });

  const stop = useCallback(() => {
    authority.startGenerationRef.current += 1;
    authority.startPendingRef.current = false;
    stopSession(client);
  }, [authority, client, stopSession]);

  const updatePreference = useCallback(
    async (patch: Partial<VoiceInputPreferences>) => {
      setSaving(true);
      setError(null);
      try {
        await updateSettings({ voiceInput: patch });
      } catch {
        setError('runtime');
      } finally {
        setSaving(false);
      }
    },
    [updateSettings]
  );

  const models = useVoiceModelSelection({ preferences, updatePreference });
  const cancel = useCallback(() => {
    authority.startGenerationRef.current += 1;
    authority.startPendingRef.current = false;
    cancelSession(client);
  }, [authority, cancelSession, client]);
  return {
    models,
    actions: {
      installPackage,
      refresh,
      requestMicrophone: () => requestMicrophone(preferences.microphoneDeviceId),
      start,
      stop,
      cancel,
    },
    preferences: createVoicePreferenceActions({
      preferences,
      saving,
      cancel,
      invalidateCapability,
      updatePreference,
    }),
    status: {
      audioLevel,
      audioPeaks,
      checking,
      error,
      installing,
      microphoneAccess,
      microphones,
      microphonesLoading,
      snapshot,
    },
    transcript: voiceSession.transcript,
  };
}

function createVoicePreferenceActions({
  preferences,
  saving,
  cancel,
  invalidateCapability,
  updatePreference,
}: {
  preferences: ReturnType<typeof resolveVoiceInputPreferences>;
  saving: boolean;
  cancel(): void;
  invalidateCapability(): void;
  updatePreference(patch: Partial<VoiceInputPreferences>): Promise<void>;
}): VoiceInputSettingsController['preferences'] {
  return {
    ...preferences,
    saving,
    setBackend: (backend) => {
      cancel();
      invalidateCapability();
      return updatePreference({ backend });
    },
    setCorrectionEnabled: (enabled) => {
      cancel();
      return updatePreference({ correction: { ...preferences.correction, enabled } });
    },
    setLanguage: (language) => {
      cancel();
      invalidateCapability();
      return updatePreference({ language });
    },
    setMicrophoneDeviceId: (microphoneDeviceId) => {
      cancel();
      return updatePreference({ microphoneDeviceId });
    },
    setMode: (mode) => {
      cancel();
      invalidateCapability();
      return updatePreference({ mode });
    },
  };
}
