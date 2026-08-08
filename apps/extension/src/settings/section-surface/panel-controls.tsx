import { GripVertical } from 'lucide-react';
import type { ButtonHTMLAttributes } from 'react';

import {
  ProductRange,
  ProductToggle,
  type ProductRangeProps,
} from '@sniptale/ui/product-form-controls';
import {
  settingsAddButtonClassName,
  settingsEmptyStateClassName,
  settingsModalFieldSurfaceClassName,
  settingsNeutralBadgeClassName,
  settingsPanelClassName,
  settingsSuccessBadgeClassName,
} from './classes';

export const settingsCardClassName = settingsPanelClassName;
export {
  settingsAddButtonClassName,
  settingsEmptyStateClassName,
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
