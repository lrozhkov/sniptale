import { CompactSelect } from '../../../../../ui/compact-inspector-controls';
import type { CompactSelectOption } from '../../../../../ui/compact-inspector-controls';
import { translate } from '../../../../../platform/i18n';
import {
  ColorField as CompactInspectorColorField,
  OptionRow,
  SelectField as CompactInspectorSelectField,
  StatusRow,
} from '../../../../../ui/compact-inspector-controls';
import {
  DEFAULT_COLOR_ACCENT,
  DEFAULT_COLOR_DANGER,
  DEFAULT_COLOR_INFO,
  DEFAULT_COLOR_SUCCESS,
  DEFAULT_COLOR_TEXT_INVERSE,
  DEFAULT_COLOR_TEXT_PANEL,
  DEFAULT_COLOR_VIDEO_BACKGROUND,
  DEFAULT_COLOR_WARNING,
} from '@sniptale/ui/default-colors/constants';

const VIDEO_EDITOR_COLOR_PALETTE = [
  DEFAULT_COLOR_ACCENT,
  DEFAULT_COLOR_INFO,
  DEFAULT_COLOR_SUCCESS,
  DEFAULT_COLOR_WARNING,
  DEFAULT_COLOR_DANGER,
  DEFAULT_COLOR_TEXT_INVERSE,
  DEFAULT_COLOR_TEXT_PANEL,
  DEFAULT_COLOR_VIDEO_BACKGROUND,
] as const;

export function SelectInput<T extends string>({
  label,
  value,
  onChange,
  options,
  disabled = false,
}: {
  label?: string | undefined;
  value: T;
  onChange: (value: T) => void;
  options: CompactSelectOption<T>[];
  disabled?: boolean;
}) {
  if (label !== undefined) {
    return (
      <CompactInspectorSelectField
        label={label}
        value={value}
        onChange={onChange}
        options={options}
        disabled={disabled}
      />
    );
  }

  return (
    <CompactSelect
      aria-label={translate('videoEditor.sidebar.selectInputLabel')}
      value={value}
      onChange={onChange}
      options={options}
      disabled={disabled}
      className="w-full"
    />
  );
}

function DisabledColorPreview(props: { label: string; value: string }) {
  return (
    <StatusRow
      label={props.label}
      value={
        <span className="inline-flex min-w-0 items-center gap-2" aria-disabled="true">
          <span
            aria-hidden="true"
            className={[
              'inline-flex h-5 w-5 shrink-0 rounded-[8px] border',
              'border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_90%,transparent)]',
              'bg-[color:var(--sniptale-color-surface-panel)]',
            ].join(' ')}
            style={{ backgroundColor: props.value }}
          />
          <span className="truncate text-[12px] font-semibold text-[var(--sniptale-color-text-primary)]">
            {props.value.toUpperCase()}
          </span>
        </span>
      }
    />
  );
}

export function ColorField({
  disabled = false,
  label,
  onChange,
  onRememberRecentColor,
  recentColors,
  value,
}: {
  disabled?: boolean;
  label: string;
  onChange: (value: string) => void;
  onRememberRecentColor: ((color: string) => Promise<void>) | undefined;
  recentColors: readonly string[] | undefined;
  value: string;
}) {
  if (disabled) {
    return <DisabledColorPreview label={label} value={value} />;
  }

  const colorSelectorProps = {
    label,
    title: label,
    value,
    palette: VIDEO_EDITOR_COLOR_PALETTE,
    onChange: (color: string) => {
      onChange(color);
      void onRememberRecentColor?.(color);
    },
    ...(recentColors ? { recentColors } : {}),
  };

  return <CompactInspectorColorField {...colorSelectorProps} />;
}

export function ToggleField(props: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <OptionRow
      active={props.checked}
      disabled={props.disabled}
      label={props.label}
      onToggle={() => props.onChange(!props.checked)}
    />
  );
}
