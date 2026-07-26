import { RotateCcw } from 'lucide-react';
import type { ReactNode } from 'react';
import { translate } from '../../../../platform/i18n';

export const PAGE_STYLE_SELECT_CLASS_NAME = '!h-10 !rounded-[10px]';

function fieldLabelClassName(modified: boolean): string {
  return [
    'flex min-w-0 items-center justify-between gap-2 text-[11px] font-semibold',
    modified
      ? 'text-[var(--sniptale-color-accent)]'
      : 'text-[var(--sniptale-color-text-secondary)]',
  ].join(' ');
}

export function Field(props: {
  children: ReactNode;
  className?: string | undefined;
  defaultValue?: string | undefined;
  label: string;
  modified?: boolean | undefined;
  onReset?: (() => void) | undefined;
}) {
  const modified = props.modified ?? false;
  return (
    <label
      data-ui="content.page-style-inspector.field"
      data-field-label={props.label}
      className={[
        'group/field relative grid w-full min-w-0 max-w-full gap-1',
        props.className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <span className={fieldLabelClassName(modified)}>
        <span className="truncate" title={props.label}>
          {props.label}
        </span>
        <span className="flex min-h-5 shrink-0 items-center justify-end gap-1">
          {modified && props.onReset ? (
            <button
              type="button"
              aria-label={`${props.label}: ${translate('content.pageStyleInspector.resetProperty')}`}
              className={[
                'inline-flex h-5 w-5 items-center justify-center rounded-[6px]',
                'text-[var(--sniptale-color-text-secondary)] opacity-0 transition-opacity',
                'hover:text-[var(--sniptale-color-accent)] group-hover/field:opacity-100 focus:opacity-100',
              ].join(' ')}
              onClick={(event) => {
                event.preventDefault();
                props.onReset?.();
              }}
            >
              <RotateCcw size={12} />
            </button>
          ) : null}
        </span>
      </span>
      {props.children}
    </label>
  );
}

export function FieldResetButton(props: {
  disabled: boolean;
  label: string;
  modified: boolean;
  onReset: () => void;
}) {
  if (!props.modified) {
    return <span className="h-5 w-5 shrink-0" aria-hidden="true" />;
  }

  return (
    <button
      type="button"
      disabled={props.disabled}
      aria-label={`${props.label}: ${translate('content.pageStyleInspector.resetProperty')}`}
      title={translate('content.pageStyleInspector.resetProperty')}
      className={[
        'inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px]',
        'text-[var(--sniptale-color-text-secondary)] opacity-0 transition-opacity',
        'hover:text-[var(--sniptale-color-accent)] group-hover/section-row:opacity-100 focus:opacity-100',
        'disabled:opacity-30',
      ].join(' ')}
      onClick={(event) => {
        event.preventDefault();
        props.onReset();
      }}
    >
      <RotateCcw size={12} />
    </button>
  );
}
