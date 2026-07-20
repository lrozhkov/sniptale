import { useRef } from 'react';
import type {
  BlurSettings,
  BorderPreset,
  FocusSettings,
  HighlighterSettings,
} from '../../../../features/highlighter/contracts';
import {
  useFrameSettingsPopoverCleanupEffect,
  useFrameSettingsPopoverLoadEffect,
  useFrameSettingsPopoverOpenStateEffect,
} from './lifecycle';

export function useFrameSettingsPopoverRefs(args: {
  blurSettings?: BlurSettings;
  borderSettings?: BorderPreset;
  focusSettings?: FocusSettings;
}) {
  const prevIsOpenRef = useRef(false);
  const borderSettingsRef = useRef(args.borderSettings);
  const blurSettingsRef = useRef(args.blurSettings);
  const focusSettingsRef = useRef(args.focusSettings);
  const blurDebounceRef = useRef<number | null>(null);
  const focusDebounceRef = useRef<number | null>(null);
  const localBlurSettingsDirtyRef = useRef(false);
  const localFocusSettingsDirtyRef = useRef(false);

  borderSettingsRef.current = args.borderSettings;
  blurSettingsRef.current = args.blurSettings;
  focusSettingsRef.current = args.focusSettings;

  return {
    blurDebounceRef,
    blurSettingsRef,
    borderSettingsRef,
    focusDebounceRef,
    focusSettingsRef,
    localBlurSettingsDirtyRef,
    localFocusSettingsDirtyRef,
    prevIsOpenRef,
  };
}

export function useFrameSettingsPopoverEffects(args: {
  blurDebounceRef: { current: number | null };
  blurSettingsRef: { current: BlurSettings | undefined };
  borderSettingsRef: { current: BorderPreset | undefined };
  frameId: string;
  focusDebounceRef: { current: number | null };
  focusSettingsRef: { current: FocusSettings | undefined };
  isOpen: boolean;
  localBlurSettingsDirtyRef: { current: boolean };
  localFocusSettingsDirtyRef: { current: boolean };
  prevIsOpenRef: { current: boolean };
  setGlobalSettings: (settings: HighlighterSettings) => void;
  setLocalBlurSettings: (settings: BlurSettings) => void;
  setLocalFocusSettings: (settings: FocusSettings) => void;
  setSelectedPresetId: (presetId: string) => void;
}) {
  useFrameSettingsPopoverLoadEffect({
    blurSettingsRef: args.blurSettingsRef,
    focusSettingsRef: args.focusSettingsRef,
    isOpen: args.isOpen,
    localBlurSettingsDirtyRef: args.localBlurSettingsDirtyRef,
    localFocusSettingsDirtyRef: args.localFocusSettingsDirtyRef,
    setGlobalSettings: args.setGlobalSettings,
    setLocalBlurSettings: args.setLocalBlurSettings,
    setLocalFocusSettings: args.setLocalFocusSettings,
  });

  useFrameSettingsPopoverOpenStateEffect({
    blurSettingsRef: args.blurSettingsRef,
    borderSettingsRef: args.borderSettingsRef,
    frameId: args.frameId,
    focusSettingsRef: args.focusSettingsRef,
    isOpen: args.isOpen,
    localBlurSettingsDirtyRef: args.localBlurSettingsDirtyRef,
    localFocusSettingsDirtyRef: args.localFocusSettingsDirtyRef,
    prevIsOpenRef: args.prevIsOpenRef,
    setLocalBlurSettings: args.setLocalBlurSettings,
    setLocalFocusSettings: args.setLocalFocusSettings,
    setSelectedPresetId: args.setSelectedPresetId,
  });

  useFrameSettingsPopoverCleanupEffect({
    blurDebounceRef: args.blurDebounceRef,
    focusDebounceRef: args.focusDebounceRef,
  });
}
