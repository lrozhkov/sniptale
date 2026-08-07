// policyStateIds: [] - editor creation defaults are reconstructible UI preferences and grant no authority.
import { useSyncExternalStore } from 'react';
import { projectBorderPresetToAppliedSettings } from '@sniptale/runtime-contracts/highlighter/border-preset';
import type { CalloutSettings } from '@sniptale/runtime-contracts/highlighter/callout';
import type { StepBadgeSettings } from '@sniptale/runtime-contracts/highlighter/step-badge';
import type {
  AppliedBorderSettings,
  BlurSettings,
  EffectMode,
  FocusSettings,
} from '../../features/highlighter/contracts';
import {
  DEFAULT_BLUR_SETTINGS,
  DEFAULT_BORDER_PRESET,
  DEFAULT_FOCUS_SETTINGS,
} from '../../features/highlighter/style/defaults';
import type { FrameAnnotationSnapshotV1 } from '../../features/highlighter/frame-annotation';
import type { HighlighterSettings } from '../../features/highlighter/contracts';
import { resolveEnabledBorderPreset } from '../../features/highlighter/presets/enabled-catalog';

interface FrameAnnotationCreationDefaults {
  blurSettings: BlurSettings;
  borderSettings: AppliedBorderSettings;
  callout: CalloutSettings | null;
  effectMode: EffectMode;
  focusSettings: FocusSettings;
  stepBadge: StepBadgeSettings | null;
}

function createInitialDefaults(): FrameAnnotationCreationDefaults {
  return {
    blurSettings: structuredClone(DEFAULT_BLUR_SETTINGS),
    borderSettings: projectBorderPresetToAppliedSettings(DEFAULT_BORDER_PRESET),
    callout: null,
    effectMode: 'border',
    focusSettings: structuredClone(DEFAULT_FOCUS_SETTINGS),
    stepBadge: null,
  };
}

let current = createInitialDefaults();
let mutationRevision = 0;
let initialization: Promise<void> | null = null;
const listeners = new Set<() => void>();

export function getFrameAnnotationCreationDefaults(): FrameAnnotationCreationDefaults {
  return structuredClone(current);
}

export function setFrameAnnotationCreationDefaults(
  next:
    | FrameAnnotationCreationDefaults
    | ((value: FrameAnnotationCreationDefaults) => FrameAnnotationCreationDefaults)
): void {
  mutationRevision += 1;
  current = structuredClone(
    typeof next === 'function' ? next(getFrameAnnotationCreationDefaults()) : next
  );
  listeners.forEach((listener) => listener());
}

export function initializeFrameAnnotationCreationDefaults(
  load: () => Promise<HighlighterSettings>
): Promise<void> {
  if (initialization) return initialization;
  const startRevision = mutationRevision;
  initialization = load()
    .then((settings) => {
      if (mutationRevision !== startRevision) return;
      const preset = resolveEnabledBorderPreset(settings, settings.defaultBorderPresetId);
      const effects = preset.effects;
      current = {
        ...current,
        effectMode: settings.defaultEffectMode,
        borderSettings: projectBorderPresetToAppliedSettings(preset),
        blurSettings: {
          ...settings.defaultBlurSettings,
          ...(effects?.blur ?? {}),
        },
        focusSettings: {
          ...settings.defaultFocusSettings,
          ...(effects?.focus ?? {}),
        },
      };
      listeners.forEach((listener) => listener());
    })
    .catch(() => undefined);
  return initialization;
}

export function useFrameAnnotationCreationDefaults(): FrameAnnotationCreationDefaults {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
    () => current
  );
}

export function createFrameAnnotationFromDefaults(input: {
  id: string;
  ordering: number;
  x: number;
  y: number;
}): FrameAnnotationSnapshotV1 {
  const defaults = getFrameAnnotationCreationDefaults();
  return {
    version: 1,
    id: input.id,
    ordering: input.ordering,
    x: input.x,
    y: input.y,
    width: 0,
    height: 0,
    effectMode: defaults.effectMode,
    borderSettings: defaults.borderSettings,
    blurSettings: defaults.blurSettings,
    focusSettings: defaults.focusSettings,
    ...(defaults.callout ? { callout: defaults.callout } : {}),
    ...(defaults.stepBadge ? { stepBadge: defaults.stepBadge } : {}),
  };
}
