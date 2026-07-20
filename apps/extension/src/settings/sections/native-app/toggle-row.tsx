import { SettingsSwitch } from '../../section-surface/panel-controls';

export function ToggleRow(props: {
  checked: boolean;
  description?: string;
  disabled?: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <span className="min-w-0">
        <span className="block text-sm text-[var(--sniptale-color-text-primary)]">
          {props.label}
        </span>
        {props.description ? (
          <span className="block text-xs leading-5 text-[var(--sniptale-color-text-muted)]">
            {props.description}
          </span>
        ) : null}
      </span>
      <SettingsSwitch
        aria-label={props.label}
        checked={props.checked}
        className="mt-1 shrink-0"
        disabled={props.disabled}
        onClick={() => props.onChange(!props.checked)}
      />
    </div>
  );
}
