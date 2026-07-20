import type { ReactNode } from 'react';

import type { QuickAction, ViewportPreset } from '../../../../../contracts/settings';
import { getQuickActionDisplayName } from '../../../../../features/quick-actions-presets/catalog';
import { DynamicIcon } from '../../../navigation/actions';
import { formatHotkeyShort } from '../../../navigation/actions';
import {
  cx,
  disabledQuickActionListItemClassName,
  getQuickActionItemState,
  getQuickActionListButtonClassName,
  getQuickActionListIconClassName,
  enabledQuickActionListItemClassName,
  shouldShowQuickActionMeta,
  type QuickActionListDensity,
} from './helpers';
export type { QuickActionListDensity } from './helpers';

interface QuickActionItemProps {
  action: QuickAction;
  presets: ViewportPreset[];
  disabledTitle?: string | null;
  onTriggerAction: (actionId: string) => void;
}

function QuickActionButton({
  action,
  disabled,
  title,
  className,
  onTriggerAction,
  children,
}: {
  action: QuickAction;
  disabled: boolean;
  title: string;
  className: string;
  onTriggerAction: (actionId: string) => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      title={title}
      onClick={() => {
        if (!disabled) {
          onTriggerAction(action.id);
        }
      }}
      className={className}
    >
      {children}
    </button>
  );
}

function QuickActionListItemIcon({
  action,
  disabled,
  density,
}: {
  action: QuickAction;
  disabled: boolean;
  density: QuickActionListDensity;
}) {
  return (
    <span
      className={cx(
        getQuickActionListIconClassName(density),
        'text-[var(--sniptale-color-text-secondary)]'
      )}
    >
      <DynamicIcon
        name={action.icon}
        color={disabled ? 'var(--sniptale-color-text-dim)' : 'var(--sniptale-color-text-secondary)'}
      />
    </span>
  );
}

function QuickActionListItemBody({
  action,
  meta,
  disabled,
  density,
}: {
  action: QuickAction;
  meta: string;
  disabled: boolean;
  density: QuickActionListDensity;
}) {
  return (
    <span className="min-w-0 flex-1">
      <span
        className={cx(
          'block truncate text-[12px] font-medium',
          disabled
            ? 'text-[var(--sniptale-color-text-muted)]'
            : 'text-[var(--sniptale-color-text-primary)]'
        )}
      >
        {getQuickActionDisplayName(action)}
      </span>
      {shouldShowQuickActionMeta(density) ? (
        <span
          className={cx(
            'block truncate text-xs',
            disabled
              ? 'text-[var(--sniptale-color-text-dim)]'
              : 'text-[var(--sniptale-color-text-secondary)]'
          )}
        >
          {meta}
        </span>
      ) : null}
    </span>
  );
}

function QuickActionListItemTrailing({ action }: { action: QuickAction }) {
  if (action.hotkey) {
    return (
      <span
        className={
          'rounded-full border border-[var(--sniptale-color-border-soft)] ' +
          'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-canvas)_42%,transparent)] ' +
          'px-2 py-0.5 text-xs font-medium uppercase tracking-[0.06em] ' +
          'text-[var(--sniptale-color-text-dim)]'
        }
      >
        {formatHotkeyShort(action.hotkey)}
      </span>
    );
  }
  return null;
}

export function QuickActionListItem({
  action,
  presets,
  density,
  disabledTitle,
  onTriggerAction,
}: QuickActionItemProps & {
  density: QuickActionListDensity;
}) {
  const { meta, disabled, title } = getQuickActionItemState(
    disabledTitle === undefined
      ? {
          action,
          presets,
        }
      : {
          action,
          presets,
          disabledTitle,
        }
  );

  return (
    <QuickActionButton
      action={action}
      disabled={disabled}
      title={title}
      onTriggerAction={onTriggerAction}
      className={cx(
        getQuickActionListButtonClassName(density),
        'shadow-none transition-colors',
        disabled ? disabledQuickActionListItemClassName : enabledQuickActionListItemClassName
      )}
    >
      <QuickActionListItemIcon action={action} disabled={disabled} density={density} />
      <QuickActionListItemBody action={action} meta={meta} disabled={disabled} density={density} />
      <QuickActionListItemTrailing action={action} />
    </QuickActionButton>
  );
}
