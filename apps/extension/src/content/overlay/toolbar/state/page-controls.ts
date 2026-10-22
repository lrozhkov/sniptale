import { createContext, useCallback, useEffect, useRef, useState } from 'react';
import type { ContentToolbarPreferences, PageToolbarControl } from '../../../../contracts/settings';
import { loadSettings, patchSettings } from '../../../../composition/persistence/settings';
import { translate } from '../../../../platform/i18n';

type Controls = NonNullable<ContentToolbarPreferences['pageControls']>;

/** Owns persistent visibility and disposable customization for one mounted page toolbar. */
export function usePageToolbarControls(enabled: boolean) {
  const [controls, setControls] = useState<Controls>({});
  const [editing, setEditing] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const saving = useRef(false);
  const mounted = useRef(false);
  const reload = useCallback(async () => {
    const request = ++generation.current;
    setReady(false);
    setError(null);
    try {
      const settings = await loadSettings();
      if (request !== generation.current) return;
      setControls(settings.contentToolbar?.pageControls ?? {});
      setReady(true);
    } catch {
      if (request === generation.current) setError(translate('common.errors.loadFailed'));
    }
  }, []);
  useEffect(() => {
    mounted.current = enabled;
    setPending(saving.current);
    setEditing(false);
    setRevealed(false);
    if (enabled) void reload();
    return () => {
      mounted.current = false;
      generation.current += 1;
    };
  }, [enabled, reload]);
  useEffect(() => {
    if (!editing) return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setEditing(false);
    };
    window.addEventListener('keydown', onEscape);
    return () => window.removeEventListener('keydown', onEscape);
  }, [editing]);
  const setVisible = async (control: PageToolbarControl, visible: boolean) => {
    if (!enabled || !ready || saving.current) return;
    const request = generation.current;
    saving.current = true;
    setPending(true);
    setError(null);
    try {
      const settings = await patchSettings({
        contentToolbar: { pageControls: { [control]: visible } },
      });
      if (request === generation.current) setControls(settings.contentToolbar?.pageControls ?? {});
    } catch {
      if (request === generation.current) setError(translate('common.errors.saveFailed'));
    } finally {
      saving.current = false;
      if (mounted.current) {
        setPending(false);
        if (request !== generation.current) void reload();
      }
    }
  };
  return {
    controls,
    editing: enabled && editing,
    revealed: enabled && revealed,
    ready,
    pending,
    error,
    reload,
    setVisible,
    isVisible: (control: PageToolbarControl) =>
      !enabled || editing || revealed || controls[control] !== false,
    toggleEditing: () => {
      if (ready && !saving.current) {
        setRevealed(false);
        setEditing((value) => !value);
      }
    },
    toggleRevealed: () => {
      setEditing(false);
      setRevealed((value) => !value);
    },
  };
}

export const PageToolbarControlsContext = createContext<ReturnType<
  typeof usePageToolbarControls
> | null>(null);
