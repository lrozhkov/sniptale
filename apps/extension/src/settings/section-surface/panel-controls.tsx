import { GripVertical } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

import {
  ProductRange,
  ProductToggle,
  type ProductRangeProps,
} from '@sniptale/ui/product-form-controls';
import {
  settingsAddButtonClassName,
  settingsEmptyStateClassName,
  settingsModalClassName,
  settingsModalFieldSurfaceClassName,
  settingsNeutralBadgeClassName,
  settingsPanelClassName,
  settingsSuccessBadgeClassName,
} from './classes';

export const settingsCardClassName = settingsPanelClassName;
export {
  settingsAddButtonClassName,
  settingsEmptyStateClassName,
  settingsModalClassName,
  settingsModalFieldSurfaceClassName,
  settingsNeutralBadgeClassName,
  settingsSuccessBadgeClassName,
};

export function SettingsSwitch({
  checked,
  className = '',
  size = 'md',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  checked: boolean;
  size?: 'sm' | 'md';
}) {
  return <ProductToggle {...props} checked={checked} className={className} size={size} />;
}

export function SettingsRange({ className = '', ...props }: ProductRangeProps) {
  return <ProductRange {...props} className={className} />;
}

export function SettingsControlRow(props: {
  children: ReactNode;
  className?: string;
  description?: ReactNode;
  label: ReactNode;
  valueClassName?: string;
}) {
  return (
    <div
      data-ui="settings.control-row"
      className={[
        'grid min-h-12 w-full max-w-[720px] items-center gap-2 py-2.5',
        'sm:grid-cols-[minmax(0,1fr)_minmax(220px,280px)] sm:gap-5',
        props.className ?? '',
      ].join(' ')}
    >
      <div className="min-w-0">
        <div className="text-sm font-medium text-[var(--sniptale-color-text-primary)]">
          {props.label}
        </div>
        {props.description ? (
          <div className="mt-0.5 text-xs leading-5 text-[var(--sniptale-color-text-muted)]">
            {props.description}
          </div>
        ) : null}
      </div>
      <div
        data-ui="settings.control-row.value"
        className={[
          'w-full max-w-[280px] min-w-0 sm:justify-self-end',
          props.valueClassName ?? '',
        ].join(' ')}
      >
        {props.children}
      </div>
    </div>
  );
}

export function SettingsDragHandle(props: { className?: string }) {
  return (
    <div
      className={[
        'flex-shrink-0 cursor-grab text-[var(--sniptale-color-text-dim)] transition-colors',
        'hover:text-[var(--sniptale-color-text-muted)] active:cursor-grabbing',
        props.className ?? '',
      ].join(' ')}
    >
      <GripVertical size={16} />
    </div>
  );
}
