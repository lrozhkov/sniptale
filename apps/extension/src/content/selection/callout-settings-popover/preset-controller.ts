import { useEffect, useRef, useState } from 'react';
import type {
  CalloutPreset,
  CalloutPresetCatalog,
  CalloutSettings,
} from '@sniptale/runtime-contracts/highlighter/callout';
import { translate } from '../../../platform/i18n';
import {
  createUserCalloutPreset,
  loadCalloutPresetCatalog,
  setCalloutPresetEnabled,
  subscribeToCalloutPresetCatalog,
  updateCalloutPreset,
} from '../../../composition/persistence/callout-presets';

export function useCalloutPresetPopoverController(args: {
  applyPreset: (preset: CalloutPreset) => void;
  isOpen: boolean;
  localSettings: CalloutSettings;
}) {
  const [catalog, setCatalog] = useState<CalloutPresetCatalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const catalogRequestRef = useRef(0);
  const sessionGenerationRef = useRef(0);
  const isSessionCurrent = (sessionId: number) =>
    args.isOpen && sessionId === sessionGenerationRef.current;

  useEffect(() => {
    if (!args.isOpen) return;
    const sessionId = sessionGenerationRef.current + 1;
    sessionGenerationRef.current = sessionId;
    const requestId = catalogRequestRef.current + 1;
    catalogRequestRef.current = requestId;
    void loadCalloutPresetCatalog()
      .then((nextCatalog) => {
        if (sessionId === sessionGenerationRef.current && requestId === catalogRequestRef.current) {
          setCatalog(nextCatalog);
          setError(null);
        }
      })
      .catch(() => {
        if (sessionId === sessionGenerationRef.current && requestId === catalogRequestRef.current) {
          setError(translate('content.callout.presetLoadError'));
        }
      });
    const unsubscribe = subscribeToCalloutPresetCatalog((nextCatalog) => {
      if (sessionId !== sessionGenerationRef.current) return;
      catalogRequestRef.current += 1;
      setCatalog(nextCatalog);
      setError(null);
    });
    return () => {
      if (sessionId === sessionGenerationRef.current) sessionGenerationRef.current += 1;
      catalogRequestRef.current += 1;
      unsubscribe();
    };
  }, [args.isOpen]);

  const loadCurrentCatalog = async (sessionId: number) => {
    if (!isSessionCurrent(sessionId)) return null;
    const requestId = catalogRequestRef.current + 1;
    catalogRequestRef.current = requestId;
    let nextCatalog: CalloutPresetCatalog;
    try {
      nextCatalog = await loadCalloutPresetCatalog();
    } catch (caught) {
      if (!isSessionCurrent(sessionId) || requestId !== catalogRequestRef.current) return null;
      throw caught;
    }
    if (!isSessionCurrent(sessionId) || requestId !== catalogRequestRef.current) return null;
    setCatalog(nextCatalog);
    setError(null);
    return nextCatalog;
  };
  const save = async (name: string) => {
    const sessionId = sessionGenerationRef.current;
    if (!isSessionCurrent(sessionId)) return;
    try {
      const result = await createUserCalloutPreset({ name, style: args.localSettings.style });
      if (!isSessionCurrent(sessionId)) return;
      if (result.outcome !== 'applied') throw new Error('Preset save rejected');
      const nextCatalog = await loadCurrentCatalog(sessionId);
      if (!nextCatalog) return;
      const created = nextCatalog.presets.find((preset) => preset.id === result.id);
      if (created) args.applyPreset(created);
    } catch {
      if (isSessionCurrent(sessionId)) {
        setError(translate('content.callout.presetSaveError'));
      }
    }
  };
  const edit = async (preset: CalloutPreset) => {
    const sessionId = sessionGenerationRef.current;
    if (!isSessionCurrent(sessionId)) return;
    try {
      const result = await updateCalloutPreset({
        id: preset.id,
        name: preset.name,
        style: args.localSettings.style,
      });
      if (!isSessionCurrent(sessionId)) return;
      if (result.outcome === 'rejected') throw new Error('Preset update rejected');
      await loadCurrentCatalog(sessionId);
    } catch {
      if (isSessionCurrent(sessionId)) {
        setError(translate('content.callout.presetUpdateError'));
      }
    }
  };
  const toggle = async (preset: CalloutPreset) => {
    const sessionId = sessionGenerationRef.current;
    if (!isSessionCurrent(sessionId)) return;
    try {
      const result = await setCalloutPresetEnabled(preset.id, preset.enabled === false);
      if (!isSessionCurrent(sessionId)) return;
      if (result.outcome === 'rejected') throw new Error('Preset toggle rejected');
      await loadCurrentCatalog(sessionId);
    } catch {
      if (isSessionCurrent(sessionId)) {
        setError(translate('content.callout.presetToggleError'));
      }
    }
  };

  return { catalog, edit, error, save, toggle };
}
