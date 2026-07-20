import { translate } from '../../../platform/i18n';
import type { ScenarioStep } from '../../../features/scenario/contracts/types/project';

export function resolveNoteToneClasses(tone: 'neutral' | 'info' | 'warning' | 'error'): string {
  switch (tone) {
    case 'info':
      return [
        'border-[color:color-mix(in_srgb,var(--sniptale-color-info)_28%,var(--sniptale-color-border-soft)_72%)]',
        'bg-[color:color-mix(in_srgb,var(--sniptale-color-info)_10%,transparent)]',
      ].join(' ');
    case 'warning':
      return [
        'border-[color:color-mix(in_srgb,var(--sniptale-color-warning)_34%,var(--sniptale-color-border-soft)_66%)]',
        'bg-[color:color-mix(in_srgb,var(--sniptale-color-warning)_12%,transparent)]',
      ].join(' ');
    case 'error':
      return [
        'border-[color:color-mix(in_srgb,var(--sniptale-color-danger)_34%,var(--sniptale-color-border-soft)_66%)]',
        'bg-[color:color-mix(in_srgb,var(--sniptale-color-danger-soft)_52%,transparent)]',
      ].join(' ');
    case 'neutral':
    default:
      return [
        'border-[var(--sniptale-color-border-soft)]',
        'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_96%,transparent)]',
      ].join(' ');
  }
}

function getNoteToneLabel(tone: 'neutral' | 'info' | 'warning' | 'error'): string {
  switch (tone) {
    case 'info':
      return translate('scenario.editor.noteTone.info');
    case 'warning':
      return translate('scenario.editor.noteTone.warning');
    case 'error':
      return translate('scenario.editor.noteTone.error');
    case 'neutral':
    default:
      return translate('scenario.editor.noteTone.neutral');
  }
}

export function InlineTextField(props: {
  emphasis?: 'body' | 'title';
  multiline?: boolean;
  placeholder: string;
  value: string;
  onBlur?: () => void;
  onChange: (value: string) => void;
  onCommit?: () => void;
}) {
  const emphasisClassName =
    props.emphasis === 'title'
      ? 'text-base font-semibold leading-6'
      : 'text-sm leading-6 text-[var(--sniptale-color-text-secondary)]';
  const className =
    'w-full rounded-[14px] border px-3 py-2 text-[var(--sniptale-color-text-primary)] outline-none ' +
    'transition placeholder:text-[var(--sniptale-color-text-muted)] ' +
    'border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_84%,white_16%)] ' +
    'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_92%,white_8%)] ' +
    'focus:border-[var(--sniptale-color-border-accent-strong)] ' +
    'focus:bg-[var(--sniptale-color-surface-panel)]';

  return props.multiline ? (
    <textarea
      rows={4}
      value={props.value}
      onChange={(event) => props.onChange(event.target.value)}
      onBlur={props.onBlur}
      placeholder={props.placeholder}
      className={`${className} ${emphasisClassName} resize-none`}
    />
  ) : (
    <input
      value={props.value}
      onChange={(event) => props.onChange(event.target.value)}
      onBlur={props.onBlur}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          props.onCommit?.();
        }
      }}
      placeholder={props.placeholder}
      className={`${className} ${emphasisClassName}`}
    />
  );
}

export const NOTE_TONES: Array<Extract<ScenarioStep, { kind: 'note' }>['tone']> = [
  'neutral',
  'info',
  'warning',
  'error',
];

export function ScenarioNoteToneButton(props: {
  onClick: () => void;
  tone: Extract<ScenarioStep, { kind: 'note' }>['tone'];
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className="rounded-full border border-[var(--sniptale-color-border-soft)] bg-[var(--sniptale-color-surface-panel)]
        px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--sniptale-color-text-secondary)]"
    >
      {getNoteToneLabel(props.tone)}
    </button>
  );
}
