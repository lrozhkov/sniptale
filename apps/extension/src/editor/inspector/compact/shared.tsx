import React from 'react';
import { Eye, Link, Link2, Monitor, Palette, Scaling, Sparkles, Type } from 'lucide-react';
import { cx } from '../../chrome/ui';

type CompactCommandIcon =
  | 'browser'
  | 'color'
  | 'link'
  | 'opacity'
  | 'preset'
  | 'size'
  | 'text'
  | 'trajectory';

export interface CompactCommand {
  id: string;
  icon?: CompactCommandIcon;
  title: string;
  trigger: React.ReactNode;
  value?: string;
  content?: React.ReactNode;
  preservePopoverLabel?: boolean;
  onClick?: () => Promise<void> | void;
  onMouseDown?: React.MouseEventHandler<HTMLButtonElement>;
  active?: boolean;
  danger?: boolean;
  disabled?: boolean;
}

export const CompactCommandToken: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className }) => (
  <span className={cx('text-xs font-semibold uppercase text-current', className)}>{children}</span>
);

export const CompactColorSwatchTrigger: React.FC<{
  color: string;
  mode?: 'fill' | 'stroke' | 'text';
  opacity?: number;
}> = ({ color, mode = 'fill', opacity = 1 }) => {
  const swatchStyle = { '--compact-command-color': color } as React.CSSProperties;
  const normalizedOpacity = Math.max(0.08, Math.min(1, opacity));

  if (mode === 'text') {
    return (
      <span
        aria-hidden="true"
        className={[
          'flex h-5 w-5 items-center justify-center rounded-[5px]',
          'text-[13px] font-semibold leading-none',
          'text-[color:var(--compact-command-color)]',
        ].join(' ')}
        style={{ ...swatchStyle, opacity: normalizedOpacity }}
      >
        A
      </span>
    );
  }

  return (
    <span
      aria-hidden="true"
      className={[
        'grid h-5 w-5 place-items-center rounded-[6px] border',
        'border-[color:var(--sniptale-color-border-soft)]',
        'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_92%,transparent)]',
      ].join(' ')}
      style={swatchStyle}
    >
      <span
        className={cx(
          'block h-3.5 w-3.5 rounded-[4px]',
          mode === 'stroke'
            ? 'border-2 border-[color:var(--compact-command-color)] bg-[color:var(--sniptale-color-surface-panel)]'
            : 'bg-[color:var(--compact-command-color)]'
        )}
        style={{ opacity: normalizedOpacity }}
      />
    </span>
  );
};

export const CompactLineTrigger: React.FC<{
  color?: string;
  style?: 'solid' | 'dashed' | 'dotted' | string;
  width?: number;
}> = ({ color = 'currentColor', style = 'solid', width = 2 }) => {
  const normalizedWidth = Math.max(1, Math.min(5, Math.round(width)));
  const borderStyle =
    style === 'dotted' || style === 'dot' ? 'dotted' : style.includes('dash') ? 'dashed' : 'solid';

  return (
    <span
      aria-hidden="true"
      className="flex h-5 w-5 items-center justify-center"
      style={{ '--compact-command-color': color } as React.CSSProperties}
    >
      <span
        className="block w-4 rounded-full"
        style={{
          borderTopColor: 'var(--compact-command-color)',
          borderTopStyle: borderStyle,
          borderTopWidth: normalizedWidth,
        }}
      />
    </span>
  );
};

export const CompactCommandField: React.FC<{
  label: string;
  value?: string;
  children: React.ReactNode;
  note?: string;
  className?: string;
  hideLabel?: boolean;
  hideValue?: boolean;
}> = ({ label, value, children, note, className, hideLabel = false, hideValue = false }) => (
  <div className={cx('space-y-3', className)}>
    {hideLabel ? null : (
      <div className="flex items-center justify-between gap-3">
        <span className="text-[12px] font-bold uppercase text-[color:var(--sniptale-color-text-secondary)]">
          {label}
        </span>
        {value && !hideValue ? (
          <span className="text-xs font-medium text-[color:var(--sniptale-color-text-secondary)]">
            {value}
          </span>
        ) : null}
      </div>
    )}
    {note ? (
      <div className="text-sm leading-6 text-[color:var(--sniptale-color-text-secondary)]">
        {note}
      </div>
    ) : null}
    {children}
  </div>
);

export function renderCompactCommandContent(
  command: Pick<CompactCommand, 'content'>,
  options: { hideLabel?: boolean; hideValue?: boolean } = {}
): React.ReactNode {
  if (!command.content) {
    return null;
  }

  if (React.isValidElement(command.content) && command.content.type === CompactCommandField) {
    const currentProps = command.content.props as React.ComponentProps<typeof CompactCommandField>;
    return React.cloneElement(
      command.content as React.ReactElement<React.ComponentProps<typeof CompactCommandField>>,
      {
        hideLabel: options.hideLabel ?? currentProps.hideLabel ?? false,
        hideValue: options.hideValue ?? currentProps.hideValue ?? true,
      }
    );
  }

  return command.content;
}

export function resolveCompactCommandTrigger(command: CompactCommand): React.ReactNode {
  if (!React.isValidElement(command.trigger) || command.trigger.type !== CompactCommandToken) {
    return command.trigger;
  }

  switch (command.icon) {
    case undefined:
      return command.trigger;
    case 'link':
      return <Link size={15} strokeWidth={2} />;
    case 'browser':
      return <Monitor size={15} strokeWidth={2} />;
    case 'color':
      return <Palette size={15} strokeWidth={2} />;
    case 'opacity':
      return <Eye size={15} strokeWidth={2} />;
    case 'trajectory':
      return <Link2 size={15} strokeWidth={2} />;
    case 'text':
      return <Type size={15} strokeWidth={2} />;
    case 'preset':
      return <Sparkles size={15} strokeWidth={2} />;
    case 'size':
      return <Scaling size={15} strokeWidth={2} />;
  }
}
