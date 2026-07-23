import { useEffect, useRef, useState } from 'react';
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

function syncFrameSettingsPopoverOpenState(args: {
  blurSettingsRef: { current: BlurSettings | undefined };
  borderSettingsRef: { current: BorderPreset | undefined };
  focusSettingsRef: { current: FocusSettings | undefined };
  frameId: string;
  isOpen: boolean;
  localBlurSettingsDirtyRef: { current: boolean };
  localFocusSettingsDirtyRef: { current: boolean };
  prevIsOpenRef: { current: boolean };
  setLocalBlurSettings: (settings: BlurSettings) => void;
  setLocalFocusSettings: (settings: FocusSettings) => void;
  setSelectedPresetId: (presetId: string) => void;
}) {
  const transactionKey = `frame-settings:${args.frameId}`;

  if (args.isOpen && !args.prevIsOpenRef.current) {
    pagePreparationHistory.beginTransaction(transactionKey);
    args.localBlurSettingsDirtyRef.current = false;
    args.localFocusSettingsDirtyRef.current = false;
    args.setSelectedPresetId(args.borderSettingsRef.current?.id ?? DEFAULT_BORDER_PRESET.id);
    args.setLocalBlurSettings({
      ...(args.blurSettingsRef.current ?? DEFAULT_BLUR_SETTINGS),
    });
    args.setLocalFocusSettings({
      ...(args.focusSettingsRef.current ?? getDefaultFocusSettings()),
    });
  } else if (!args.isOpen && args.prevIsOpenRef.current) {
    pagePreparationHistory.commitTransaction(transactionKey);
  }

  args.prevIsOpenRef.current = args.isOpen;
}

function useFrameSettingsPopoverOpenStateCleanup(frameId: string) {
  useEffect(() => {
    return () => {
      pagePreparationHistory.cancelTransaction(`frame-settings:${frameId}`);
    };
  }, [frameId]);
}

type FrameSettingsPopoverLoadEffectArgs = {
  blurSettingsRef: { current: BlurSettings | undefined };
  focusSettingsRef: { current: FocusSettings | undefined };
  isOpen: boolean;
  localBlurSettingsDirtyRef: { current: boolean };
  localFocusSettingsDirtyRef: { current: boolean };
  setGlobalSettings: (settings: HighlighterSettings) => void;
  setLocalBlurSettings: (settings: BlurSettings) => void;
  setLocalFocusSettings: (settings: FocusSettings) => void;
};

type LoadFrameSettingsDefaultsArgs = Omit<FrameSettingsPopoverLoadEffectArgs, 'isOpen'> & {
  isCancelled: () => boolean;
};

function loadFrameSettingsDefaults(args: LoadFrameSettingsDefaultsArgs) {
  void loadHighlighterSettings()
    .then((settings) => applyLoadedFrameSettingsDefaults({ ...args, settings }))
    .catch((error) => {
      logger.error('Failed to load frame-settings popover defaults', error);
    });
}

function useFrameSettingsPopoverLoadEffect(args: FrameSettingsPopoverLoadEffectArgs) {
  const {
    blurSettingsRef,
    focusSettingsRef,
    isOpen,
    localBlurSettingsDirtyRef,
    localFocusSettingsDirtyRef,
    setGlobalSettings,
    setLocalBlurSettings,
    setLocalFocusSettings,
  } = args;

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    let cancelled = false;

    loadFrameSettingsDefaults({
      blurSettingsRef,
      focusSettingsRef,
      isCancelled: () => cancelled,
      localBlurSettingsDirtyRef,
      localFocusSettingsDirtyRef,
      setGlobalSettings,
      setLocalBlurSettings,
      setLocalFocusSettings,
    });

    return () => {
      cancelled = true;
    };
  }, [
    blurSettingsRef,
    focusSettingsRef,
    isOpen,
    localBlurSettingsDirtyRef,
    localFocusSettingsDirtyRef,
    setGlobalSettings,
    setLocalBlurSettings,
    setLocalFocusSettings,
  ]);
}

function applyLoadedFrameSettingsDefaults(args: {
  blurSettingsRef: { current: BlurSettings | undefined };
  focusSettingsRef: { current: FocusSettings | undefined };
  isCancelled: () => boolean;
  localBlurSettingsDirtyRef: { current: boolean };
  localFocusSettingsDirtyRef: { current: boolean };
  setGlobalSettings: (settings: HighlighterSettings) => void;
  setLocalBlurSettings: (settings: BlurSettings) => void;
  setLocalFocusSettings: (settings: FocusSettings) => void;
  settings: HighlighterSettings;
}) {
  if (args.isCancelled()) {
    return;
  }

  args.setGlobalSettings(args.settings);

  if (
    !args.blurSettingsRef.current &&
    !args.localBlurSettingsDirtyRef.current &&
    args.settings.defaultBlurSettings
  ) {
    args.setLocalBlurSettings({ ...args.settings.defaultBlurSettings });
  }

  if (
    !args.focusSettingsRef.current &&
    !args.localFocusSettingsDirtyRef.current &&
    args.settings.defaultFocusSettings
  ) {
    args.setLocalFocusSettings({ ...args.settings.defaultFocusSettings });
  }
}

type FrameSettingsPopoverOpenStateEffectArgs = {
  blurSettingsRef: { current: BlurSettings | undefined };
  borderSettingsRef: { current: BorderPreset | undefined };
  frameId: string;
  focusSettingsRef: { current: FocusSettings | undefined };
  isOpen: boolean;
  localBlurSettingsDirtyRef: { current: boolean };
  localFocusSettingsDirtyRef: { current: boolean };
  prevIsOpenRef: { current: boolean };
  setLocalBlurSettings: (settings: BlurSettings) => void;
  setLocalFocusSettings: (settings: FocusSettings) => void;
  setSelectedPresetId: (presetId: string) => void;
};

function useFrameSettingsPopoverOpenStateEffect(args: FrameSettingsPopoverOpenStateEffectArgs) {
  const {
    blurSettingsRef,
    borderSettingsRef,
    frameId,
    focusSettingsRef,
    isOpen,
    localBlurSettingsDirtyRef,
    localFocusSettingsDirtyRef,
    prevIsOpenRef,
    setLocalBlurSettings,
    setLocalFocusSettings,
    setSelectedPresetId,
  } = args;
  useFrameSettingsPopoverOpenStateCleanup(frameId);

  useEffect(() => {
    syncFrameSettingsPopoverOpenState({
      blurSettingsRef,
      borderSettingsRef,
      focusSettingsRef,
      frameId,
      isOpen,
      localBlurSettingsDirtyRef,
      localFocusSettingsDirtyRef,
      prevIsOpenRef,
      setLocalBlurSettings,
      setLocalFocusSettings,
      setSelectedPresetId,
    });
  }, [
    blurSettingsRef,
    borderSettingsRef,
    focusSettingsRef,
    frameId,
    isOpen,
    localBlurSettingsDirtyRef,
    localFocusSettingsDirtyRef,
    prevIsOpenRef,
    setLocalBlurSettings,
    setLocalFocusSettings,
    setSelectedPresetId,
  ]);
}

export function useFrameSettingsPopoverLifecycle(args: {
  blurSettings?: BlurSettings;
  borderSettings?: BorderPreset;
  focusSettings?: FocusSettings;
  frameId: string;
  isOpen: boolean;
}) {
  const [globalSettings, setGlobalSettings] = useState(() => createDefaultHighlighterSettings());
  const [selectedPresetId, setSelectedPresetId] = useState(DEFAULT_BORDER_PRESET.id);
  const [localBlurSettings, setLocalBlurSettings] = useState<BlurSettings>({
    ...DEFAULT_BLUR_SETTINGS,
  });
  const [localFocusSettings, setLocalFocusSettings] = useState<FocusSettings>(() =>
    getDefaultFocusSettings()
  );
  const prevIsOpenRef = useRef(false);
  const borderSettingsRef = useRef(args.borderSettings);
  const blurSettingsRef = useRef(args.blurSettings);
  const focusSettingsRef = useRef(args.focusSettings);
  const localBlurSettingsDirtyRef = useRef(false);
  const localFocusSettingsDirtyRef = useRef(false);

  borderSettingsRef.current = args.borderSettings;
  blurSettingsRef.current = args.blurSettings;
  focusSettingsRef.current = args.focusSettings;

  useFrameSettingsPopoverLoadEffect({
    blurSettingsRef,
    focusSettingsRef,
    isOpen: args.isOpen,
    localBlurSettingsDirtyRef,
    localFocusSettingsDirtyRef,
    setGlobalSettings,
    setLocalBlurSettings,
    setLocalFocusSettings,
  });
  useFrameSettingsPopoverOpenStateEffect({
    blurSettingsRef,
    borderSettingsRef,
    focusSettingsRef,
    frameId: args.frameId,
    isOpen: args.isOpen,
    localBlurSettingsDirtyRef,
    localFocusSettingsDirtyRef,
    prevIsOpenRef,
    setLocalBlurSettings,
    setLocalFocusSettings,
    setSelectedPresetId,
  });

  return {
    applyBlurSettingsFromUser: (settings: BlurSettings) => {
      localBlurSettingsDirtyRef.current = true;
      setLocalBlurSettings(settings);
    },
    applyFocusSettingsFromUser: (settings: FocusSettings) => {
      localFocusSettingsDirtyRef.current = true;
      setLocalFocusSettings(settings);
    },
    globalSettings,
    localBlurSettings,
    localFocusSettings,
    selectPreset: (presetId: string) => setSelectedPresetId(presetId),
    selectedPresetId,
  };
}
