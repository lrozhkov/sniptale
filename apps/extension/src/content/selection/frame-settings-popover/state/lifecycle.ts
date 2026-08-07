import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { createLogger } from '@sniptale/platform/observability/logger';
import type {
  AppliedBorderSettings,
  BlurSettings,
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
import {
  createSessionVisibleBorderPresetIds,
  mergeSessionVisibleBorderPresetIds,
  selectSessionVisibleBorderPresets,
} from '../../../../features/highlighter/presets/session-visible';
import {
  cloneAppliedBorderSettings,
  normalizeAppliedBorderSettings,
  projectBorderPresetToAppliedSettings,
  cloneBorderPresetEffects,
} from '@sniptale/runtime-contracts/highlighter/border-preset';

const logger = createLogger({ namespace: 'ContentFrameSettingsPopoverLifecycle' });

interface FrameSettingsDraft {
  globalSettings: HighlighterSettings;
  localBorderSettings: AppliedBorderSettings;
  localBlurSettings: BlurSettings;
  localFocusSettings: FocusSettings;
  selectedPresetId: string | undefined;
  visiblePresetIds: string[];
}

interface FrameSettingsLifecycleState {
  catalogRevision: number;
  dirty: { blur: boolean; focus: boolean };
  previousOpen: boolean;
  source: {
    blur: BlurSettings | undefined;
    border: AppliedBorderSettings | undefined;
    focus: FocusSettings | undefined;
  };
}

type FrameSettingsLifecycleRef = { current: FrameSettingsLifecycleState };
type SetFrameSettingsDraft = Dispatch<SetStateAction<FrameSettingsDraft>>;

function createInitialDraft(args?: {
  blurSettings?: BlurSettings;
  borderSettings?: AppliedBorderSettings;
  focusSettings?: FocusSettings;
}): FrameSettingsDraft {
  const localBorderSettings = normalizeAppliedBorderSettings(
    args?.borderSettings ?? projectBorderPresetToAppliedSettings(DEFAULT_BORDER_PRESET)
  );
  return {
    globalSettings: createDefaultHighlighterSettings(),
    localBorderSettings,
    localBlurSettings: { ...(args?.blurSettings ?? DEFAULT_BLUR_SETTINGS) },
    localFocusSettings: { ...(args?.focusSettings ?? getDefaultFocusSettings()) },
    selectedPresetId:
      args?.borderSettings === undefined
        ? DEFAULT_BORDER_PRESET.id
        : localBorderSettings.sourcePresetId,
    visiblePresetIds: [DEFAULT_BORDER_PRESET.id],
  };
}

function createLifecycleState(args: {
  blurSettings?: BlurSettings;
  borderSettings?: AppliedBorderSettings;
  focusSettings?: FocusSettings;
}): FrameSettingsLifecycleState {
  return {
    catalogRevision: 0,
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
  setDraft((current) => {
    const preset = settings.borderPresets.find(
      (item) => item.id === (current.selectedPresetId ?? settings.defaultBorderPresetId)
    );
    const effects = cloneBorderPresetEffects(preset?.effects);
    return {
      ...current,
      globalSettings: settings,
      visiblePresetIds: createSessionVisibleBorderPresetIds(settings),
      ...(!source.blur && !dirty.blur
        ? {
            localBlurSettings: {
              ...settings.defaultBlurSettings,
              ...effects.blur,
              showBorder: true,
            },
          }
        : {}),
      ...(!source.focus && !dirty.focus
        ? {
            localFocusSettings: {
              ...settings.defaultFocusSettings,
              blurAmount: effects.focus.blurAmount,
              opacity: effects.focus.opacity,
              showBorder: true,
            },
          }
        : {}),
    };
  });
}

function useFrameSettingsDefaultsLoad(
  isOpen: boolean,
  lifecycleRef: FrameSettingsLifecycleRef,
  setDraft: SetFrameSettingsDraft
): void {
  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    const loadRevision = lifecycleRef.current.catalogRevision;
    void loadHighlighterSettings()
      .then((settings) => {
        if (!cancelled && lifecycleRef.current.catalogRevision === loadRevision) {
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
  historyTransaction: boolean,
  lifecycleRef: FrameSettingsLifecycleRef,
  setDraft: SetFrameSettingsDraft
): void {
  const lifecycle = lifecycleRef.current;
  const transactionKey = `frame-settings:${frameId}`;

  if (isOpen && !lifecycle.previousOpen) {
    if (historyTransaction) {
      pagePreparationHistory.beginTransaction(transactionKey);
    }
    lifecycle.dirty.blur = false;
    lifecycle.dirty.focus = false;
    setDraft((current) => {
      const localBorderSettings = normalizeAppliedBorderSettings(
        lifecycle.source.border ?? projectBorderPresetToAppliedSettings(DEFAULT_BORDER_PRESET)
      );
      return {
        ...current,
        localBorderSettings,
        selectedPresetId: localBorderSettings.sourcePresetId,
        localBlurSettings: { ...(lifecycle.source.blur ?? DEFAULT_BLUR_SETTINGS) },
        localFocusSettings: { ...(lifecycle.source.focus ?? getDefaultFocusSettings()) },
        visiblePresetIds: createSessionVisibleBorderPresetIds(current.globalSettings),
      };
    });
  } else if (!isOpen && lifecycle.previousOpen && historyTransaction) {
    pagePreparationHistory.commitTransaction(transactionKey);
  }

  lifecycle.previousOpen = isOpen;
}

function useFrameSettingsOpenTransaction(
  frameId: string,
  isOpen: boolean,
  historyTransaction: boolean,
  lifecycleRef: FrameSettingsLifecycleRef,
  setDraft: SetFrameSettingsDraft
): void {
  useEffect(() => {
    if (!historyTransaction) return;
    return () => {
      pagePreparationHistory.cancelTransaction(`frame-settings:${frameId}`);
    };
  }, [frameId, historyTransaction]);

  useEffect(() => {
    syncFrameSettingsPopoverOpenState(frameId, isOpen, historyTransaction, lifecycleRef, setDraft);
  }, [frameId, historyTransaction, isOpen, lifecycleRef, setDraft]);
}

export function useFrameSettingsPopoverLifecycle(args: {
  blurSettings?: BlurSettings;
  borderSettings?: AppliedBorderSettings;
  focusSettings?: FocusSettings;
  frameId: string;
  historyTransaction?: boolean;
  isOpen: boolean;
}) {
  const [draft, setDraft] = useState(() => createInitialDraft(args));
  const lifecycleRef = useRef(createLifecycleState(args));
  lifecycleRef.current.source = {
    blur: args.blurSettings,
    border: args.borderSettings,
    focus: args.focusSettings,
  };

  useFrameSettingsDefaultsLoad(args.isOpen, lifecycleRef, setDraft);
  useFrameSettingsOpenTransaction(
    args.frameId,
    args.isOpen,
    args.historyTransaction ?? true,
    lifecycleRef,
    setDraft
  );

  return {
    catalog: {
      globalSettings: draft.globalSettings,
      reconcileCatalogSettings: (settings: HighlighterSettings, revealPresetId?: string) => {
        lifecycleRef.current.catalogRevision += 1;
        setDraft((current) => {
          const visiblePresetIds = mergeSessionVisibleBorderPresetIds(
            current.visiblePresetIds,
            settings,
            revealPresetId
          );
          return { ...current, globalSettings: settings, visiblePresetIds };
        });
      },
      visibleBorderPresets: selectSessionVisibleBorderPresets(
        draft.globalSettings,
        draft.visiblePresetIds
      ),
    },
    frame: {
      applyBorderSettingsFromUser: (settings: AppliedBorderSettings) => {
        setDraft((current) => ({
          ...current,
          localBorderSettings: cloneAppliedBorderSettings(settings),
          selectedPresetId: settings.sourcePresetId,
        }));
      },
      applyBlurSettingsFromUser: (settings: BlurSettings) => {
        lifecycleRef.current.dirty.blur = true;
        setDraft((current) => ({ ...current, localBlurSettings: settings }));
      },
      applyFocusSettingsFromUser: (settings: FocusSettings) => {
        lifecycleRef.current.dirty.focus = true;
        setDraft((current) => ({ ...current, localFocusSettings: settings }));
      },
      localBlurSettings: draft.localBlurSettings,
      localBorderSettings: draft.localBorderSettings,
      localFocusSettings: draft.localFocusSettings,
      selectPreset: (settings: AppliedBorderSettings) => {
        setDraft((current) => ({
          ...current,
          localBorderSettings: cloneAppliedBorderSettings(settings),
          selectedPresetId: settings.sourcePresetId,
        }));
      },
      selectedPresetId: draft.selectedPresetId,
    },
  };
}
