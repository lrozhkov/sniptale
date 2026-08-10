import { SettingsControlRow, SettingsSwitch } from '../../../../section-surface/panel-controls';

export function ToggleRow(props: {
  checked: boolean;
  description?: string;
  disabled?: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <SettingsControlRow
      label={props.label}
      description={props.description}
      valueClassName="flex justify-start sm:justify-end"
    >
      <SettingsSwitch
        aria-label={props.label}
        checked={props.checked}
        className="shrink-0"
        disabled={props.disabled}
        onClick={() => props.onChange(!props.checked)}
      />
    </SettingsControlRow>
  );
}
