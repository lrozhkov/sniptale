import { useCallback, useEffect, useRef, useState } from 'react';

import { translate } from '../../../../../platform/i18n';
import type { HotkeyConfig } from '../../../../../contracts/settings';
import { formatHotkey } from '../../../../../features/keyboard-shortcuts/hotkey-format';
import {
  getQuickActionHotkeyValidationFailure,
  hotkeyEventToConfig,
  type QuickActionHotkeyValidationFailure,
} from '../../../../../features/keyboard-shortcuts/hotkeys';

// policyStateIds: [] - shortcut assignment rules are immutable UI validation policy,
// not mutable capability or authorization state.

export interface HotkeyKeyboardEvent {
  altKey: boolean;
  code?: string | undefined;
  ctrlKey: boolean;
  key: string;
  metaKey: boolean;
  preventDefault: () => void;
  shiftKey: boolean;
  stopPropagation: () => void;
}

export interface HotkeyMouseEvent {
  preventDefault: () => void;
  stopPropagation: () => void;
}

function buildHotkeyFromEvent(event: HotkeyKeyboardEvent): HotkeyConfig {
  return hotkeyEventToConfig(event);
}

function useHotkeyDisplayValue(value?: HotkeyConfig | null) {
  const [displayValue, setDisplayValue] = useState('');

  useEffect(() => {
    setDisplayValue(value ? formatHotkey(value) : '');
  }, [value]);

  return { displayValue, setDisplayValue };
}

function useHotkeyFeedbackDisplayReset(
  setDisplayValue: React.Dispatch<React.SetStateAction<string>>,
  value?: HotkeyConfig | null
) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearFeedbackDisplayReset = useCallback(() => {
    if (timeoutRef.current === null) {
      return;
    }

    clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
  }, []);

  const scheduleFeedbackDisplayReset = useCallback(() => {
    clearFeedbackDisplayReset();
    timeoutRef.current = setTimeout(() => {
      timeoutRef.current = null;
      setDisplayValue(value ? formatHotkey(value) : '');
    }, 1500);
  }, [clearFeedbackDisplayReset, setDisplayValue, value]);

  useEffect(() => clearFeedbackDisplayReset, [clearFeedbackDisplayReset]);

  return {
    clearFeedbackDisplayReset,
    scheduleFeedbackDisplayReset,
  };
}

function getHotkeyValidationMessage(failure: QuickActionHotkeyValidationFailure): string {
  if (failure === 'modifier-required') {
    return translate('settings.hotkeyInput.modifierRequired');
  }
  if (failure === 'altgr-conflict') {
    return translate('settings.hotkeyInput.altGrConflict');
  }
  if (failure === 'unsupported-key') {
    return translate('settings.hotkeyInput.unsupportedKey');
  }
  return translate('settings.hotkeyInput.reservedCombination');
}

interface UseHotkeyInputControllerArgs {
  onChange: (hotkey: HotkeyConfig | null) => void;
  onError?: (message: string) => void;
  value?: HotkeyConfig | null;
}

function useHotkeyKeyDownHandler({
  clearFeedbackDisplayReset,
  onChange,
  onError,
  scheduleFeedbackDisplayReset,
  setDisplayValue,
}: UseHotkeyInputControllerArgs & {
  clearFeedbackDisplayReset: () => void;
  scheduleFeedbackDisplayReset: () => void;
  setDisplayValue: React.Dispatch<React.SetStateAction<string>>;
}) {
  return useCallback(
    (event: HotkeyKeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      clearFeedbackDisplayReset();

      if (['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) {
        return false;
      }

      if (event.key === 'Escape') {
        return true;
      }

      const hotkey = buildHotkeyFromEvent(event);
      const validationFailure = getQuickActionHotkeyValidationFailure(hotkey);
      if (validationFailure) {
        const message = getHotkeyValidationMessage(validationFailure);
        onError?.(message);
        setDisplayValue(message);
        scheduleFeedbackDisplayReset();
        return false;
      }

      onChange(hotkey);
      return true;
    },
    [clearFeedbackDisplayReset, onChange, onError, scheduleFeedbackDisplayReset, setDisplayValue]
  );
}

function useHotkeyFocusState() {
  const [isRecording, setIsRecording] = useState(false);

  return {
    handleBlur: () => setIsRecording(false),
    handleFocus: () => setIsRecording(true),
    isRecording,
    setIsRecording,
  };
}

export function useHotkeyInputController({
  onChange,
  onError,
  value,
}: UseHotkeyInputControllerArgs) {
  const focusState = useHotkeyFocusState();
  const inputRef = useRef<HTMLButtonElement>(null);
  const { displayValue, setDisplayValue } = useHotkeyDisplayValue(value);
  const { clearFeedbackDisplayReset, scheduleFeedbackDisplayReset } = useHotkeyFeedbackDisplayReset(
    setDisplayValue,
    value
  );
  const baseHandleKeyDown = useHotkeyKeyDownHandler({
    clearFeedbackDisplayReset,
    onChange,
    scheduleFeedbackDisplayReset,
    setDisplayValue,
    ...(onError === undefined ? {} : { onError }),
  });

  const handleKeyDown = useCallback(
    (event: HotkeyKeyboardEvent) => {
      const shouldStopRecording = baseHandleKeyDown(event);
      if (shouldStopRecording) {
        focusState.setIsRecording(false);
      }
    },
    [baseHandleKeyDown, focusState]
  );

  const handleClear = useCallback(
    (event: HotkeyMouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      clearFeedbackDisplayReset();
      onChange(null);
    },
    [clearFeedbackDisplayReset, onChange]
  );

  return {
    displayValue,
    handleBlur: focusState.handleBlur,
    handleClear,
    handleFocus: focusState.handleFocus,
    handleKeyDown,
    inputRef,
    isRecording: focusState.isRecording,
  };
}
