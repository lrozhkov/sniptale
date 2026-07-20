import { SettingsSwitch } from '../../../section-surface/panel-controls';
import { settingsToggleRowClassName } from '../../../section-surface';

export function AppearanceSwitchRow(props: {
  checked: boolean;
  description?: string;
  disabled?: boolean;
  label: string;
  onToggle: () => void;
  tone?: 'primary' | 'secondary';
}) {
  const tone = props.tone ?? 'secondary';

  return (
    <div
      className={[
        tone === 'primary'
          ? settingsToggleRowClassName
          : [
              'flex items-center justify-between gap-3 rounded-[12px] px-3 py-3',
              'bg-transparent',
              'text-[var(--sniptale-color-text-secondary)] transition-colors',
              'hover:bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-hover)_72%,transparent)]',
            ].join(' '),
        props.disabled ? 'opacity-50' : '',
      ].join(' ')}
    >
      <AppearanceSwitchRowText
        label={props.label}
        tone={tone}
        {...(props.description === undefined ? {} : { description: props.description })}
      />
      <SettingsSwitch
        checked={props.checked}
        disabled={props.disabled}
        size="md"
        onClick={props.onToggle}
        aria-label={props.label}
      />
    </div>
  );
}

function AppearanceSwitchRowText(props: {
  description?: string;
  label: string;
  tone: 'primary' | 'secondary';
}) {
  return (
    <div className="min-w-0">
      <div
        className={[
          'text-sm',
          props.tone === 'primary'
            ? 'font-medium text-[var(--sniptale-color-text-primary)]'
            : 'font-medium text-[var(--sniptale-color-text-secondary)]',
        ].join(' ')}
      >
        {props.label}
      </div>
      {props.description ? (
        <p className="mt-1 max-w-2xl text-xs text-[var(--sniptale-color-text-dim)]">
          {props.description}
        </p>
      ) : null}
    </div>
  );
}
