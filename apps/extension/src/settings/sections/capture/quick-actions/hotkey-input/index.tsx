import { useId, type MouseEvent, type KeyboardEvent, type RefObject } from 'react';
import { X } from 'lucide-react';
import { translate } from '../../../../../platform/i18n';
import type { HotkeyConfig } from '../../../../../contracts/settings';
import { useHotkeyInputController } from './controller';

interface HotkeyInputProps {
  value?: HotkeyConfig | null;
  onChange: (hotkey: HotkeyConfig | null) => void;
  onError?: (message: string) => void;
  placeholder?: string;
}

const hotkeyInputRecordingClassName = ['border-[var(--sniptale-color-border-accent-strong)]'].join(
  ' '
);

const hotkeyInputIdleClassName = 'border-[var(--sniptale-color-border-soft)]';

const hotkeyInputFieldBaseClassName = [
  'flex h-8 min-w-0 flex-1 cursor-pointer items-center rounded-[4px] border px-3 py-1.5 text-left',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-canvas)_42%,transparent)]',
  'text-[13px] leading-[18px] font-medium text-[var(--sniptale-color-text-primary)]',
  'transition-all duration-200 focus:outline-none',
  'focus-visible:ring-2 focus-visible:ring-[var(--sniptale-color-focus-ring)]',
].join(' ');

function HotkeyInputClearButton({ handleClear }: { handleClear: (event: MouseEvent) => void }) {
  return (
    <button
      type="button"
      onClick={handleClear}
      className={[
        'sniptale-dismiss-button',
        'flex h-8 w-8 shrink-0 items-center justify-center rounded-[4px]',
        'transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sniptale-color-focus-ring)]',
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
  hasValue,
  hintId,
  inputRef,
  isRecording,
  placeholder,
}: {
  displayValue: string;
  handleBlur: () => void;
  handleClear: (event: MouseEvent) => void;
  handleFocus: () => void;
  handleKeyDown: (event: KeyboardEvent) => void;
  hasValue: boolean;
  hintId: string;
  inputRef: RefObject<HTMLButtonElement | null>;
  isRecording: boolean;
  placeholder: string;
}) {
  const fieldClassName = isRecording ? hotkeyInputRecordingClassName : hotkeyInputIdleClassName;

  const textClassName = displayValue
    ? 'text-[var(--sniptale-color-text-primary)]'
    : 'text-[var(--sniptale-color-text-dim)]';

  return (
    <div className="flex items-center gap-1.5">
      <button
        ref={inputRef}
        type="button"
        aria-describedby={isRecording ? hintId : undefined}
        onKeyDown={handleKeyDown}
        onFocus={handleFocus}
        onBlur={handleBlur}
        className={`${hotkeyInputFieldBaseClassName} ${fieldClassName}`}
        data-ui="settings.quick-actions.hotkey-recorder"
      >
        <span className={`min-w-0 truncate ${textClassName}`}>
          {isRecording
            ? translate('settings.hotkeyInput.recordingPlaceholder')
            : displayValue || placeholder}
        </span>
      </button>
      {hasValue && !isRecording ? <HotkeyInputClearButton handleClear={handleClear} /> : null}
    </div>
  );
}

export function HotkeyInput({
  value,
  onChange,
  onError,
  placeholder = translate('settings.hotkeyInput.placeholder'),
}: HotkeyInputProps) {
  const hintId = useId();
  const controller = useHotkeyInputController({
    onChange,
    ...(onError === undefined ? {} : { onError }),
    ...(value === undefined ? {} : { value }),
  });

  return (
    <div>
      <HotkeyInputField
        displayValue={controller.displayValue}
        handleBlur={controller.handleBlur}
        handleClear={controller.handleClear}
        handleFocus={controller.handleFocus}
        handleKeyDown={controller.handleKeyDown}
        hasValue={Boolean(value)}
        hintId={hintId}
        inputRef={controller.inputRef}
        isRecording={controller.isRecording}
        placeholder={placeholder}
      />
      {controller.isRecording ? (
        <p
          id={hintId}
          role="status"
          className="mt-1 text-xs leading-4 text-[var(--sniptale-color-accent)]"
        >
          {translate('settings.hotkeyInput.recordingHint')}
        </p>
      ) : null}
    </div>
  );
}
