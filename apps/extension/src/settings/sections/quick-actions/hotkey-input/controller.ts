import { useCallback, useEffect, useRef, useState } from 'react';

import { translate } from '../../../../platform/i18n';
import type { HotkeyConfig } from '../../../../contracts/settings';
import { formatHotkey } from '../../../../features/keyboard-shortcuts/hotkey-format';
import {
  hotkeyEventToConfig,
  isHotkeyReserved,
  hotkeyToKeyString,
} from '../../../../features/keyboard-shortcuts/hotkeys';

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

const RESERVED_KEYS = new Set([
  'F5',
  'F11',
  'F12',
  'Escape',
  'Tab',
  'Enter',
  'Ctrl+T',
  'Ctrl+W',
  'Ctrl+N',
  'Ctrl+R',
  'Ctrl+Tab',
  'Ctrl+Shift+T',
  'Ctrl+Shift+Tab',
  'Ctrl+Shift+N',
  'Ctrl+L',
  'Ctrl+O',
  'Ctrl+P',
  'Ctrl+S',
  'Ctrl+F',
  'Ctrl+G',
  'Ctrl+H',
  'Ctrl+J',
  'Ctrl+K',
  'Ctrl+D',
  'Alt+F4',
  'Alt+Tab',
  'Alt+F4',
  'Cmd+T',
  'Cmd+W',
  'Cmd+N',
  'Cmd+R',
  'Cmd+Shift+T',
  'Cmd+Shift+N',
  'Cmd+L',
  'Cmd+P',
  'Cmd+S',
  'Cmd+F',
]);

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

function useReservedHotkeyDisplayReset(
  setDisplayValue: React.Dispatch<React.SetStateAction<string>>,
  value?: HotkeyConfig | null
) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearReservedDisplayReset = useCallback(() => {
    if (timeoutRef.current === null) {
      return;
    }

    clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
  }, []);

  const scheduleReservedDisplayReset = useCallback(() => {
    clearReservedDisplayReset();
    timeoutRef.current = setTimeout(() => {
      timeoutRef.current = null;
      setDisplayValue(value ? formatHotkey(value) : '');
    }, 1500);
  }, [clearReservedDisplayReset, setDisplayValue, value]);

  useEffect(() => clearReservedDisplayReset, [clearReservedDisplayReset]);

  return {
    clearReservedDisplayReset,
    scheduleReservedDisplayReset,
  };
}

interface UseHotkeyInputControllerArgs {
  onChange: (hotkey: HotkeyConfig | null) => void;
  onError?: (message: string) => void;
  value?: HotkeyConfig | null;
}

function useHotkeyKeyDownHandler({
  clearReservedDisplayReset,
  onChange,
  onError,
  scheduleReservedDisplayReset,
  setDisplayValue,
}: UseHotkeyInputControllerArgs & {
  clearReservedDisplayReset: () => void;
  scheduleReservedDisplayReset: () => void;
  setDisplayValue: React.Dispatch<React.SetStateAction<string>>;
}) {
  return useCallback(
    (event: HotkeyKeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      clearReservedDisplayReset();

      if (['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) {
        return false;
      }

      if (event.key === 'Escape') {
        onChange(null);
        return true;
      }

      const hotkey = buildHotkeyFromEvent(event);
      const isFunctionKey = /^F\d+$/.test(event.key);
      const hasModifier = event.ctrlKey || event.shiftKey || event.altKey || event.metaKey;

      if (!hasModifier && !isFunctionKey) {
        onError?.(translate('settings.hotkeyInput.modifierRequired'));
        return false;
      }

      const keyString = hotkeyToKeyString(hotkey);
      if (RESERVED_KEYS.has(keyString) || isHotkeyReserved(hotkey)) {
        onError?.(translate('settings.hotkeyInput.reservedCombination'));
        setDisplayValue(translate('settings.hotkeyInput.reservedDisplay'));
        scheduleReservedDisplayReset();
        return false;
      }

      onChange(hotkey);
      return true;
    },
    [clearReservedDisplayReset, onChange, onError, scheduleReservedDisplayReset, setDisplayValue]
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
  const inputRef = useRef<HTMLDivElement>(null);
  const { displayValue, setDisplayValue } = useHotkeyDisplayValue(value);
  const { clearReservedDisplayReset, scheduleReservedDisplayReset } = useReservedHotkeyDisplayReset(
    setDisplayValue,
    value
  );
  const baseHandleKeyDown = useHotkeyKeyDownHandler({
    clearReservedDisplayReset,
    onChange,
    scheduleReservedDisplayReset,
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
      clearReservedDisplayReset();
      onChange(null);
    },
    [clearReservedDisplayReset, onChange]
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
