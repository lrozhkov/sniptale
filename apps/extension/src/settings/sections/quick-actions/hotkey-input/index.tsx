import type React from 'react';
import { X } from 'lucide-react';
import { translate } from '../../../../platform/i18n';
import type { HotkeyConfig } from '../../../../contracts/settings';
import { useHotkeyInputController } from './controller';

interface HotkeyInputProps {
  value?: HotkeyConfig | null;
  onChange: (hotkey: HotkeyConfig | null) => void;
  onError?: (message: string) => void;
  placeholder?: string;
}

const hotkeyInputRecordingClassName = [
  'border-[var(--sniptale-color-border-accent-strong)]',
  'shadow-[0_0_15px_color-mix(in_srgb,var(--sniptale-color-accent)_20%,transparent)]',
].join(' ');

const hotkeyInputIdleClassName = 'border-[var(--sniptale-color-border-soft)]';

const hotkeyInputFieldBaseClassName = [
  'flex h-10 w-full cursor-pointer items-center justify-between rounded-lg border px-3 py-2',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-canvas)_42%,transparent)]',
  'text-sm text-[var(--sniptale-color-text-primary)] transition-all duration-200 focus:outline-none',
].join(' ');

function HotkeyInputIndicator({ isRecording }: { isRecording: boolean }) {
  if (!isRecording) {
    return null;
  }

  return (
    <div className="absolute -bottom-5 left-0 text-xs text-[var(--sniptale-color-accent)]">
      {translate('settings.hotkeyInput.recordingHint')}
    </div>
  );
}

function HotkeyInputClearButton({
  handleClear,
}: {
  handleClear: (event: React.MouseEvent) => void;
}) {
  return (
    <button
      type="button"
      onClick={handleClear}
      className={[
        'p-1 text-[var(--sniptale-color-text-dim)] transition-colors',
        'hover:text-[var(--sniptale-color-text-primary)]',
      ].join(' ')}
      title={translate('settings.hotkeyInput.clearTitle')}
    >
      <X size={14} />
    </button>
  );
}

function HotkeyInputField({
  displayValue,
  handleBlur,
  handleClear,
  handleFocus,
  handleKeyDown,
  inputRef,
  isRecording,
  placeholder,
}: {
  displayValue: string;
  handleBlur: () => void;
  handleClear: (event: React.MouseEvent) => void;
  handleFocus: () => void;
  handleKeyDown: (event: React.KeyboardEvent) => void;
  inputRef: React.RefObject<HTMLDivElement | null>;
  isRecording: boolean;
  placeholder: string;
}) {
  const fieldClassName = isRecording ? hotkeyInputRecordingClassName : hotkeyInputIdleClassName;

  const textClassName = displayValue
    ? 'text-[var(--sniptale-color-text-primary)]'
    : 'text-[var(--sniptale-color-text-dim)]';

  return (
    <div
      ref={inputRef as React.Ref<HTMLDivElement>}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onFocus={handleFocus}
      onBlur={handleBlur}
      className={`${hotkeyInputFieldBaseClassName} ${fieldClassName}`}
    >
      <span className={textClassName}>
        {isRecording && !displayValue
          ? translate('settings.hotkeyInput.recordingPlaceholder')
          : displayValue || placeholder}
      </span>
      {displayValue ? <HotkeyInputClearButton handleClear={handleClear} /> : null}
    </div>
  );
}

export function HotkeyInput({
  value,
  onChange,
  onError,
  placeholder = translate('settings.hotkeyInput.placeholder'),
}: HotkeyInputProps) {
  const controller = useHotkeyInputController({
    onChange,
    ...(onError === undefined ? {} : { onError }),
    ...(value === undefined ? {} : { value }),
  });

  return (
    <div className="relative">
      <HotkeyInputField
        displayValue={controller.displayValue}
        handleBlur={controller.handleBlur}
        handleClear={controller.handleClear}
        handleFocus={controller.handleFocus}
        handleKeyDown={controller.handleKeyDown}
        inputRef={controller.inputRef}
        isRecording={controller.isRecording}
        placeholder={placeholder}
      />
      <HotkeyInputIndicator isRecording={controller.isRecording} />
    </div>
  );
}
