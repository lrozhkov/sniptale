import { useEffect } from 'react';
import { createLogger } from '@sniptale/platform/observability/logger';
import type {
  BlurSettings,
  BorderPreset,
  FocusSettings,
  HighlighterSettings,
} from '../../../../features/highlighter/contracts';
import {
  DEFAULT_BLUR_SETTINGS,
  DEFAULT_BORDER_PRESET,
  loadHighlighterSettings,
} from '../../../../composition/persistence/highlighter';
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

export function useFrameSettingsPopoverLoadEffect(args: FrameSettingsPopoverLoadEffectArgs) {
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

export function useFrameSettingsPopoverOpenStateEffect(
  args: FrameSettingsPopoverOpenStateEffectArgs
) {
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

export function useFrameSettingsPopoverCleanupEffect(args: {
  blurDebounceRef: { current: number | null };
  focusDebounceRef: { current: number | null };
}) {
  const { blurDebounceRef, focusDebounceRef } = args;

  useEffect(() => {
    return () => clearFrameSettingsDebounces(blurDebounceRef, focusDebounceRef);
  }, [blurDebounceRef, focusDebounceRef]);
}

function clearFrameSettingsDebounces(
  blurDebounceRef: { current: number | null },
  focusDebounceRef: { current: number | null }
) {
  const blurTimeout = blurDebounceRef.current;
  const focusTimeout = focusDebounceRef.current;

  if (blurTimeout) {
    clearTimeout(blurTimeout);
  }

  if (focusTimeout) {
    clearTimeout(focusTimeout);
  }
}
