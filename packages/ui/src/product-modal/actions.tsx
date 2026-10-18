import { useContext, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { CommandPressScope, useCommandPress } from '../control-language/press';
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
  const scoped = useContext(CommandPressScope);
  const press = useCommandPress({ ...props, enabled: scoped });
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
      {...press.props}
      data-command-press={scoped ? '' : undefined}
      data-pressing={press.pressed ? 'true' : undefined}
      data-command-tone={scoped ? tone : undefined}
      data-command-active={scoped && active ? 'true' : undefined}
      type={type}
      className={[...toneClassName, className].filter(Boolean).join(' ')}
    >
      {scoped ? <span className="sniptale-command-content">{children}</span> : children}
    </button>
  );
}
