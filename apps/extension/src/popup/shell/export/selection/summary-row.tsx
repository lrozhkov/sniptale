import { Minus } from 'lucide-react';
import type { ReactNode } from 'react';

import { translate } from '../../../../platform/i18n';
import { cx } from './utils';

export function SelectionSummaryRow(props: {
  icon: ReactNode;
  label: string;
  onRemove: () => void;
  title?: string;
}) {
  return (
    <div
      className={[
        'group relative min-w-0 rounded-[10px] py-0.5 transition-colors',
        'hover:bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-hover)_72%,transparent)]',
      ].join(' ')}
    >
      <div className="flex min-w-0 items-center gap-1.5 pl-1.5 pr-1 group-hover:pr-6 group-focus-within:pr-6">
        <div className="shrink-0">{props.icon}</div>
        <span
          title={props.title ?? props.label}
          className="truncate text-[13px] leading-5 text-[var(--sniptale-color-text-primary)]"
        >
          {props.label}
        </span>
      </div>
      <button
        type="button"
        title={translate('popup.export.removeFromSelectionAction')}
        aria-label={`${translate('popup.export.removeFromSelectionAction')}: ${props.label}`}
        className={cx(
          'absolute right-0.5 top-1/2 inline-flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-[7px]',
          'text-[var(--sniptale-color-text-secondary)] opacity-0 transition-all pointer-events-none',
          'group-hover:pointer-events-auto group-hover:opacity-100',
          'hover:bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_92%,transparent)]',
          'focus-visible:pointer-events-auto focus-visible:opacity-100 focus-visible:outline-none'
        )}
        onClick={props.onRemove}
      >
        <Minus className="h-3 w-3" />
      </button>
    </div>
  );
}
