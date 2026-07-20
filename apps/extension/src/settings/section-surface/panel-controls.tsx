import { GripVertical } from 'lucide-react';
import type { ButtonHTMLAttributes } from 'react';

import {
  ProductRange,
  ProductToggle,
  type ProductRangeProps,
} from '@sniptale/ui/product-form-controls';
import {
  settingsAddButtonClassName,
  settingsDangerIconButtonClassName,
  settingsEmptyStateClassName,
  settingsInfoIconButtonClassName,
  settingsListRowClassName,
  settingsModalFieldSurfaceClassName,
  settingsNeutralBadgeClassName,
  settingsPanelClassName,
  settingsSuccessBadgeClassName,
} from './classes';

export const settingsCardClassName = settingsPanelClassName;
export {
  settingsAddButtonClassName,
  settingsDangerIconButtonClassName,
  settingsEmptyStateClassName,
  settingsInfoIconButtonClassName,
  settingsListRowClassName,
  settingsModalFieldSurfaceClassName,
  settingsNeutralBadgeClassName,
  settingsSuccessBadgeClassName,
};

export function getSettingsHoverActionsClassName(visible: boolean) {
  return [
    'ml-auto flex flex-shrink-0 items-center gap-1 self-center transition-opacity',
    visible ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100',
  ].join(' ');
}

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
