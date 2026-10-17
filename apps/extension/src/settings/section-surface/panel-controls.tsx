import { GripVertical } from 'lucide-react';
import { ProductGlassSwitch } from '@sniptale/ui/product-glass-controls';
import { type ButtonHTMLAttributes, type ReactNode } from 'react';
import { InspectorParameterRow } from '../../ui/compact-inspector-controls/layout';

import { ProductRange, type ProductRangeProps } from '@sniptale/ui/product-form-controls';
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
  return (
    <ProductGlassSwitch
      {...props}
      role="switch"
      aria-checked={checked}
      on={checked}
      className={className}
      data-density={size}
    />
  );
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
  valueMinimum?: number;
  keepInline?: boolean;
}) {
  const control = (
    <div
      data-ui="settings.control-row.value"
      className={['settings-control-value', props.valueClassName ?? ''].join(' ')}
    >
      {props.children}
    </div>
  );
  return (
    <div
      data-ui="settings.control-row"
      className={['w-full max-w-[720px]', props.className ?? ''].join(' ')}
    >
      {typeof props.label === 'string' ? (
        <InspectorParameterRow
          label={props.label}
          valueMinimum={props.valueMinimum ?? 220}
          keepInline={props.keepInline ?? false}
        >
          {control}
        </InspectorParameterRow>
      ) : (
        <div className="sniptale-parameter-row" data-layout="inline">
          <span className="sniptale-parameter-name">{props.label}</span>
          <div className="sniptale-parameter-value">{control}</div>
        </div>
      )}
      {props.description ? (
        <div className="settings-control-description">{props.description}</div>
      ) : null}
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
