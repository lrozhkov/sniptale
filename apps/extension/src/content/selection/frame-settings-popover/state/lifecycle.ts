import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { createLogger } from '@sniptale/platform/observability/logger';
import type {
  BlurSettings,
  BorderPreset,
  FocusSettings,
  HighlighterSettings,
} from '../../../../features/highlighter/contracts';
import { loadHighlighterSettings } from '../../../../composition/persistence/highlighter';
import {
  createDefaultHighlighterSettings,
  DEFAULT_BLUR_SETTINGS,
  DEFAULT_BORDER_PRESET,
} from '../../../../features/highlighter/style/defaults';
import { pagePreparationHistory } from '../../../parser/page-preparation/history';
import { getDefaultFocusSettings } from './helpers';

const logger = createLogger({ namespace: 'ContentFrameSettingsPopoverLifecycle' });

interface FrameSettingsDraft {
  globalSettings: HighlighterSettings;
  localBlurSettings: BlurSettings;
  localFocusSettings: FocusSettings;
  selectedPresetId: string;
}

interface FrameSettingsLifecycleState {
  dirty: { blur: boolean; focus: boolean };
  previousOpen: boolean;
  source: {
    blur: BlurSettings | undefined;
    border: BorderPreset | undefined;
    focus: FocusSettings | undefined;
  };
}

type FrameSettingsLifecycleRef = { current: FrameSettingsLifecycleState };
type SetFrameSettingsDraft = Dispatch<SetStateAction<FrameSettingsDraft>>;

function createInitialDraft(): FrameSettingsDraft {
  return {
    globalSettings: createDefaultHighlighterSettings(),
    localBlurSettings: { ...DEFAULT_BLUR_SETTINGS },
    localFocusSettings: getDefaultFocusSettings(),
    selectedPresetId: DEFAULT_BORDER_PRESET.id,
  };
}

function createLifecycleState(args: {
  blurSettings?: BlurSettings;
  borderSettings?: BorderPreset;
  focusSettings?: FocusSettings;
}): FrameSettingsLifecycleState {
  return {
    dirty: { blur: false, focus: false },
    previousOpen: false,
    source: {
      blur: args.blurSettings,
      border: args.borderSettings,
      focus: args.focusSettings,
    },
  };
}

function applyLoadedFrameSettingsDefaults(
  settings: HighlighterSettings,
  lifecycleRef: FrameSettingsLifecycleRef,
  setDraft: SetFrameSettingsDraft
): void {
  const { dirty, source } = lifecycleRef.current;
  setDraft((current) => ({
    ...current,
    globalSettings: settings,
    ...(!source.blur && !dirty.blur && settings.defaultBlurSettings
      ? { localBlurSettings: { ...settings.defaultBlurSettings } }
      : {}),
    ...(!source.focus && !dirty.focus && settings.defaultFocusSettings
      ? { localFocusSettings: { ...settings.defaultFocusSettings } }
      : {}),
  }));
}

function useFrameSettingsDefaultsLoad(
  isOpen: boolean,
  lifecycleRef: FrameSettingsLifecycleRef,
  setDraft: SetFrameSettingsDraft
): void {
  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    void loadHighlighterSettings()
      .then((settings) => {
        if (!cancelled) {
          applyLoadedFrameSettingsDefaults(settings, lifecycleRef, setDraft);
        }
      })
      .catch((error) => {
        logger.error('Failed to load frame-settings popover defaults', error);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, lifecycleRef, setDraft]);
}

function syncFrameSettingsPopoverOpenState(
  frameId: string,
  isOpen: boolean,
  lifecycleRef: FrameSettingsLifecycleRef,
  setDraft: SetFrameSettingsDraft
): void {
  const lifecycle = lifecycleRef.current;
  const transactionKey = `frame-settings:${frameId}`;

  if (isOpen && !lifecycle.previousOpen) {
    pagePreparationHistory.beginTransaction(transactionKey);
    lifecycle.dirty.blur = false;
    lifecycle.dirty.focus = false;
    setDraft((current) => ({
      ...current,
      selectedPresetId: lifecycle.source.border?.id ?? DEFAULT_BORDER_PRESET.id,
      localBlurSettings: { ...(lifecycle.source.blur ?? DEFAULT_BLUR_SETTINGS) },
      localFocusSettings: { ...(lifecycle.source.focus ?? getDefaultFocusSettings()) },
    }));
  } else if (!isOpen && lifecycle.previousOpen) {
    pagePreparationHistory.commitTransaction(transactionKey);
  }

  lifecycle.previousOpen = isOpen;
}

function useFrameSettingsOpenTransaction(
  frameId: string,
  isOpen: boolean,
  lifecycleRef: FrameSettingsLifecycleRef,
  setDraft: SetFrameSettingsDraft
): void {
  useEffect(
    () => () => {
      pagePreparationHistory.cancelTransaction(`frame-settings:${frameId}`);
    },
    [frameId]
  );

  useEffect(() => {
    syncFrameSettingsPopoverOpenState(frameId, isOpen, lifecycleRef, setDraft);
  }, [frameId, isOpen, lifecycleRef, setDraft]);
}

export function useFrameSettingsPopoverLifecycle(args: {
  blurSettings?: BlurSettings;
  borderSettings?: BorderPreset;
  focusSettings?: FocusSettings;
  frameId: string;
  isOpen: boolean;
}) {
  const [draft, setDraft] = useState(createInitialDraft);
  const lifecycleRef = useRef(createLifecycleState(args));
  lifecycleRef.current.source = {
    blur: args.blurSettings,
    border: args.borderSettings,
    focus: args.focusSettings,
  };

  useFrameSettingsDefaultsLoad(args.isOpen, lifecycleRef, setDraft);
  useFrameSettingsOpenTransaction(args.frameId, args.isOpen, lifecycleRef, setDraft);

  return {
    applyBlurSettingsFromUser: (settings: BlurSettings) => {
      lifecycleRef.current.dirty.blur = true;
      setDraft((current) => ({ ...current, localBlurSettings: settings }));
    },
    applyFocusSettingsFromUser: (settings: FocusSettings) => {
      lifecycleRef.current.dirty.focus = true;
      setDraft((current) => ({ ...current, localFocusSettings: settings }));
    },
    globalSettings: draft.globalSettings,
    localBlurSettings: draft.localBlurSettings,
    localFocusSettings: draft.localFocusSettings,
    selectPreset: (presetId: string) => {
      setDraft((current) => ({ ...current, selectedPresetId: presetId }));
    },
    selectedPresetId: draft.selectedPresetId,
  };
}
