import type { ButtonHTMLAttributes, ReactNode } from 'react';
import {
  getControlPrimaryButtonClassName,
  getControlSecondaryButtonClassName,
  getControlSegmentedOptionClassName,
} from '../control-language';

export interface ProductActionButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: 'primary' | 'secondary' | 'danger' | 'toggle';
  compact?: boolean;
  active?: boolean;
  children: ReactNode;
}

export function ProductActionButton({
  tone = 'primary',
  compact = false,
  active = false,
  className = '',
  children,
  type = 'button',
  ...props
}: ProductActionButtonProps) {
  const toneClassName =
    tone === 'primary'
      ? [getControlPrimaryButtonClassName({ density: compact ? 'compact' : 'default' })]
      : tone === 'secondary'
        ? [getControlSecondaryButtonClassName({ density: compact ? 'compact' : 'default' })]
        : tone === 'danger'
          ? [
              getControlSecondaryButtonClassName({
                density: compact ? 'compact' : 'default',
                tone: 'danger',
              }),
            ]
          : [
              getControlSegmentedOptionClassName({
                active,
                density: compact ? 'compact' : 'default',
              }),
            ];

  return (
    <button
      {...props}
      type={type}
      className={[...toneClassName, className].filter(Boolean).join(' ')}
    >
      {children}
    </button>
  );
}
