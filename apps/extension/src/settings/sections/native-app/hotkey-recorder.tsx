// policyStateIds: [] - hotkey modifier tables are UI input normalization, not authority state.
import { Keyboard, X } from 'lucide-react';
import { useState } from 'react';
import type { KeyboardEvent } from 'react';

import { translate } from '../../../platform/i18n';
import {
  hotkeyEventToConfig,
  hotkeyToKeyString,
} from '../../../features/keyboard-shortcuts/hotkeys';

const modifierOnlyKeys = new Set(['Alt', 'Control', 'Meta', 'Shift']);

function createShortcutLabel(event: KeyboardEvent<HTMLButtonElement>): string | null {
  if (modifierOnlyKeys.has(event.key)) {
    return null;
  }
  const hotkey = hotkeyEventToConfig(event);
  const label = hotkeyToKeyString(hotkey);
  return label.replace('Cmd+', 'Meta+');
}

function useHotkeyRecorderState(onChange: (shortcutLabel: string) => void) {
  const [recording, setRecording] = useState(false);
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!recording) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (event.key === 'Escape') {
      setRecording(false);
    } else if (event.key === 'Backspace' || event.key === 'Delete') {
      onChange('');
      setRecording(false);
    } else {
      const shortcutLabel = createShortcutLabel(event);
      if (shortcutLabel) {
        onChange(shortcutLabel);
        setRecording(false);
      }
    }
  };
  return { handleKeyDown, recording, setRecording };
}

function HotkeyRecordButton(props: {
  disabled: boolean;
  label: string;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
  recording: boolean;
  setRecording: (recording: boolean) => void;
  value: string;
}) {
  const buttonLabel = props.value || translate('settings.nativeApp.shortcutEmpty');
  return (
    <button
      aria-label={props.label}
      aria-pressed={props.recording}
      className={[
        'sniptale-input flex h-10 min-w-0 flex-1 items-center justify-between gap-2 pr-10 text-left',
        props.recording ? 'ring-2 ring-[var(--sniptale-color-accent)]' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      disabled={props.disabled}
      type="button"
      onBlur={() => props.setRecording(false)}
      onClick={() => props.setRecording(true)}
      onKeyDown={props.onKeyDown}
    >
      <span className="flex min-w-0 items-center gap-2">
        <Keyboard className="h-4 w-4 shrink-0 text-[var(--sniptale-color-text-muted)]" />
        <span
          className={
            props.value ? 'sniptale-kbd truncate' : 'truncate text-[var(--sniptale-color-text-dim)]'
          }
        >
          {props.recording ? translate('settings.nativeApp.shortcutRecording') : buttonLabel}
        </span>
      </span>
    </button>
  );
}

function HotkeyClearButton(props: {
  disabled: boolean;
  onChange: (shortcutLabel: string) => void;
  value: string;
}) {
  return (
    <button
      aria-label={translate('settings.nativeApp.shortcutClear')}
      className={[
        'absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2',
        'items-center justify-center rounded-md text-[var(--sniptale-color-text-muted)]',
        'opacity-0 transition-opacity hover:text-[var(--sniptale-color-text-primary)]',
        props.value === ''
          ? 'pointer-events-none'
          : 'focus-visible:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100',
      ].join(' ')}
      disabled={props.disabled || props.value === ''}
      type="button"
      onClick={() => props.onChange('')}
    >
      <X className="h-4 w-4" />
    </button>
  );
}

export function HotkeyRecorder(props: {
  disabled: boolean;
  label: string;
  onChange: (shortcutLabel: string) => void;
  value: string;
}) {
  const recorder = useHotkeyRecorderState(props.onChange);

  return (
    <div className="group relative flex min-w-0 items-center">
      <HotkeyRecordButton
        disabled={props.disabled}
        label={props.label}
        onKeyDown={recorder.handleKeyDown}
        recording={recorder.recording}
        setRecording={recorder.setRecording}
        value={props.value}
      />
      <HotkeyClearButton disabled={props.disabled} onChange={props.onChange} value={props.value} />
    </div>
  );
}
