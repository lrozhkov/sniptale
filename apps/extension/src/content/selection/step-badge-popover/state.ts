import { useEffect, useRef, useState } from 'react';
import type {
  StepBadgeAlphabet,
  StepBadgeAnchor,
  StepBadgeOffsetDirection,
  StepBadgeSettings,
  StepBadgeSizeLevel,
  StepBadgeType,
} from '@sniptale/runtime-contracts/highlighter/step-badge';
import {
  DEFAULT_STEP_BADGE_SETTINGS,
  filterStepBadgeValue,
  normalizeStepBadgeFromProp,
  toggleStepBadgeOffset,
} from './helpers';
import { pagePreparationHistory } from '../../parser/page-preparation/history';
import { useStepBadgePopoverLayout } from './layout';
import { useStepBadgePopoverDistanceClose, useStepBadgePopoverOutsideClose } from './sync';
import { dispatchFrameStepBadgeChanged } from '../../platform/page-context/frame-events';

function createStepBadgeHandlers(props: {
  frameId: string;
  localStepBadgeSettings: StepBadgeSettings;
  onClose: () => void;
  setLocalStepBadgeSettings: React.Dispatch<React.SetStateAction<StepBadgeSettings>>;
}) {
  const updateSettings = (patch: Partial<StepBadgeSettings>) => {
    props.setLocalStepBadgeSettings((previous) => ({ ...previous, ...patch }));
    dispatchFrameStepBadgeChanged({ frameId: props.frameId, settings: patch });
  };

  return {
    handleAnchorChange: (anchor: StepBadgeAnchor) => updateSettings({ anchor }),
    handleAlphabetChange: (alphabet: StepBadgeAlphabet) => updateSettings({ alphabet }),
    handleAutoModeChange: (auto: boolean) => updateSettings({ auto }),
    handleEnabledChange: (enabled: boolean) => {
      updateSettings({ enabled });
      if (!enabled) {
        props.onClose();
      }
    },
    handleOffsetToggle: (direction: StepBadgeOffsetDirection) => {
      const current = props.localStepBadgeSettings.offsetDirections ?? [];
      updateSettings({ offsetDirections: toggleStepBadgeOffset(current, direction) });
    },
    handleSizeLevelChange: (sizeLevel: StepBadgeSizeLevel) => updateSettings({ sizeLevel }),
    handleTypeChange: (type: StepBadgeType) => updateSettings({ type }),
    handleValueChange: (value: string) => {
      const nextValue = filterStepBadgeValue({
        auto: props.localStepBadgeSettings.auto !== false,
        type: props.localStepBadgeSettings.type,
        value,
      });

      props.setLocalStepBadgeSettings((previous) => ({ ...previous, value: nextValue }));
      if (props.localStepBadgeSettings.auto === false) {
        dispatchFrameStepBadgeChanged({
          frameId: props.frameId,
          settings: { value: nextValue },
        });
      }
    },
  };
}

function useStepBadgeHistoryTransaction(frameId: string, isOpen: boolean) {
  const prevIsOpenRef = useRef(false);

  useEffect(() => {
    const transactionKey = `step-badge:${frameId}`;

    if (isOpen && !prevIsOpenRef.current) {
      pagePreparationHistory.beginTransaction(transactionKey);
    } else if (!isOpen && prevIsOpenRef.current) {
      pagePreparationHistory.commitTransaction(transactionKey);
    }

    prevIsOpenRef.current = isOpen;
  }, [frameId, isOpen]);

  useEffect(() => {
    return () => {
      if (prevIsOpenRef.current) {
        pagePreparationHistory.cancelTransaction(`step-badge:${frameId}`);
      }
    };
  }, [frameId]);
}

export function useStepBadgePopoverState(props: {
  anchorEl: HTMLElement | null;
  frameId: string;
  isOpen: boolean;
  onClose: () => void;
  stepBadge?: StepBadgeSettings;
}) {
  const { anchorEl, frameId, isOpen, onClose, stepBadge } = props;
  const [localStepBadgeSettings, setLocalStepBadgeSettings] = useState<StepBadgeSettings>({
    ...DEFAULT_STEP_BADGE_SETTINGS,
  });
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const stepBadgeRef = useRef(stepBadge);
  stepBadgeRef.current = stepBadge;
  useStepBadgeHistoryTransaction(frameId, isOpen);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const stepBadge = stepBadgeRef.current;
    setLocalStepBadgeSettings(
      stepBadge ? normalizeStepBadgeFromProp(stepBadge) : { ...DEFAULT_STEP_BADGE_SETTINGS }
    );
  }, [isOpen, stepBadge]);

  const getPopoverStyle = useStepBadgePopoverLayout(anchorEl);

  useStepBadgePopoverOutsideClose({ isOpen, onClose, popoverRef });
  useStepBadgePopoverDistanceClose({ isOpen, onClose, popoverRef });
  const handlers = createStepBadgeHandlers({
    frameId,
    localStepBadgeSettings,
    onClose,
    setLocalStepBadgeSettings,
  });

  return {
    getPopoverStyle,
    ...handlers,
    isAuto: localStepBadgeSettings.auto !== false,
    localStepBadgeSettings,
    popoverRef,
  };
}
