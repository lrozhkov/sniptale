import type {
  FrameData,
  GlobalStepBadgeSettings,
  StepBadgeOffsetDirection,
  StepBadgeSettings,
  StepBadgeSizeLevel,
} from '../../../../../features/highlighter/contracts';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { scheduleStepBadgeRecalculation } from '../../../frame-dom-driver/timing';

const DEFAULT_STEP_BADGE_SETTINGS: StepBadgeSettings = {
  enabled: false,
  anchor: 'top-left',
  offsetDirections: [] as StepBadgeOffsetDirection[],
  type: 'number',
  alphabet: 'cyrillic',
  value: '',
  sizeLevel: 3 as StepBadgeSizeLevel,
};

type FrameSetter = Dispatch<SetStateAction<FrameData[]>>;

export { scheduleStepBadgeRecalculation };

export function shouldRecalculateBadge(
  currentSettings: StepBadgeSettings,
  newSettings: StepBadgeSettings,
  autoMode: boolean
) {
  return (
    (!currentSettings.enabled && newSettings.enabled) ||
    (currentSettings.enabled && !newSettings.enabled && autoMode) ||
    (autoMode &&
      newSettings.enabled &&
      (currentSettings.type !== newSettings.type ||
        currentSettings.alphabet !== newSettings.alphabet)) ||
    (currentSettings.auto === false && newSettings.auto !== false)
  );
}

export function createUpdateFrameStepBadge(params: {
  setFrames: FrameSetter;
  sessionStepBadgeTemplateRef: MutableRefObject<StepBadgeSettings | null>;
  globalStepBadgeSettingsRef: MutableRefObject<GlobalStepBadgeSettings>;
  recalculateStepBadgesRef: MutableRefObject<() => void>;
}) {
  const {
    setFrames,
    sessionStepBadgeTemplateRef,
    globalStepBadgeSettingsRef,
    recalculateStepBadgesRef,
  } = params;

  return (frameId: string, settings: Partial<StepBadgeSettings>) => {
    setFrames((prev) =>
      prev.map((frame) => {
        if (frame.id !== frameId) {
          return frame;
        }

        const currentSettings = frame.stepBadge ?? DEFAULT_STEP_BADGE_SETTINGS;
        const newSettings = { ...currentSettings, ...settings };
        sessionStepBadgeTemplateRef.current = newSettings;

        if (
          shouldRecalculateBadge(
            currentSettings,
            newSettings,
            globalStepBadgeSettingsRef.current.autoMode
          )
        ) {
          scheduleStepBadgeRecalculation(recalculateStepBadgesRef);
        }

        return { ...frame, stepBadge: newSettings };
      })
    );
  };
}

export function createUpdateGlobalStepBadgeSettings(params: {
  globalStepBadgeSettingsRef: MutableRefObject<GlobalStepBadgeSettings>;
  recalculateStepBadges: () => void;
}) {
  const { globalStepBadgeSettingsRef, recalculateStepBadges } = params;

  return (settings: Partial<GlobalStepBadgeSettings>) => {
    const prevSettings = globalStepBadgeSettingsRef.current;
    const newSettings = { ...prevSettings, ...settings };

    globalStepBadgeSettingsRef.current = newSettings;

    if (!prevSettings.autoMode && newSettings.autoMode) {
      recalculateStepBadges();
    }
  };
}
