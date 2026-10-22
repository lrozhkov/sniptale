import { createContext, useCallback, useEffect, useRef, useState } from 'react';
import type {
  ContentToolbarPreferences,
  RecordingToolbarControl,
} from '../../../../contracts/settings';
import { loadSettings, patchSettings } from '../../../../composition/persistence/settings';
import { translate } from '../../../../platform/i18n';

type VisibilityPreferences = NonNullable<ContentToolbarPreferences['recordingControls']>;
type RecordingPreferencesPatch = Pick<
  ContentToolbarPreferences,
  'recordingControls' | 'fadeDuringRecording'
>;

/** Projects acknowledged recording toolbar preferences without changing recording settings. */
export function useRecordingToolbarControls(enabled: boolean, active: boolean) {
  const [controls, setControls] = useState<VisibilityPreferences>({});
  const [fadeDuringRecording, setFadeDuringRecording] = useState(true);
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pendingRef = useRef(false);
  const mountedRef = useRef(false);
  const generation = useRef(0);
  const reload = useCallback(async () => {
    const request = ++generation.current;
    setReady(false);
    setError(null);
    try {
      const settings = await loadSettings();
      if (generation.current !== request) return;
      setControls(settings.contentToolbar?.recordingControls ?? {});
      setFadeDuringRecording(settings.contentToolbar?.fadeDuringRecording ?? true);
      setReady(true);
    } catch {
      if (generation.current === request) setError(translate('common.errors.loadFailed'));
    }
  }, []);
  useEffect(() => {
    mountedRef.current = true;
    if (enabled) void reload();
    else setEditing(false);
    return () => {
      mountedRef.current = false;
      generation.current += 1;
    };
  }, [enabled, reload]);
  useEffect(() => {
    if (active) setEditing(false);
  }, [active]);

  const setPreferences = async (patch: RecordingPreferencesPatch) => {
    if (!enabled || active || !ready || pendingRef.current) return;
    const request = generation.current;
    pendingRef.current = true;
    setPending(true);
    setError(null);
    try {
      const settings = await patchSettings({
        contentToolbar: patch,
      });
      if (generation.current === request) {
        setControls(settings.contentToolbar?.recordingControls ?? {});
        setFadeDuringRecording(settings.contentToolbar?.fadeDuringRecording ?? true);
      }
    } catch {
      if (generation.current === request) setError(translate('common.errors.saveFailed'));
    } finally {
      pendingRef.current = false;
      if (mountedRef.current) setPending(false);
    }
  };

  return {
    active,
    controls,
    fadeDuringRecording,
    editing: editing && !active,
    error,
    pending,
    ready,
    reload,
    setVisible: (control: RecordingToolbarControl, visible: boolean) =>
      setPreferences({ recordingControls: { [control]: visible } }),
    setFadeDuringRecording: (enabled: boolean) => setPreferences({ fadeDuringRecording: enabled }),
    toggleEditing: () => {
      if (enabled && ready && !pendingRef.current && !active) setEditing((value) => !value);
    },
  };
}

export const RecordingToolbarControlsContext = createContext<ReturnType<
  typeof useRecordingToolbarControls
> | null>(null);
