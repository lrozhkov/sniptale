import { useCallback, useMemo, useState } from 'react';
import { createVoiceInputClient, type VoiceInputClient } from '../../../workflows/voice-input';
import { useSettingsStore } from '../../runtime/store/useSettingsStore';
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
      settings.voiceInput ?? {
        language: 'ru-RU' as const,
        microphoneDeviceId: null,
        mode: 'local-first' as const,
      },
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
  } = voiceSession.connection;
  const { audioLevel, audioPeaks, setSnapshot, snapshot } = voiceSession.snapshotState;
  const capability = useLocalVoiceCapability({
    language: preferences.language,
    mode: preferences.mode,
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
    async (patch: Partial<typeof preferences>) => {
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

  return {
    actions: {
      installPackage,
      refresh,
      requestMicrophone: () => requestMicrophone(preferences.microphoneDeviceId),
      start,
      stop,
    },
    preferences: {
      ...preferences,
      saving,
      setLanguage: (language) => {
        authority.startGenerationRef.current += 1;
        invalidateCapability();
        return updatePreference({ language });
      },
      setMicrophoneDeviceId: (microphoneDeviceId) => {
        authority.startGenerationRef.current += 1;
        return updatePreference({ microphoneDeviceId });
      },
      setMode: (mode) => {
        authority.startGenerationRef.current += 1;
        invalidateCapability();
        return updatePreference({ mode });
      },
    },
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
