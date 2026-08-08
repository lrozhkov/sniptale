import { Check, ChevronDown, ChevronUp, MoreHorizontal, RotateCcw, Trash2 } from 'lucide-react';
import { useId } from 'react';

import { translate } from '../../../platform/i18n';
import { useSettingsCollectionActionMenuInteraction } from './action-menu-interaction';
import type {
  SettingsCollectionAction,
  SettingsCollectionItem,
  SettingsCollectionMoveIntent,
} from './types';

type MenuAction = {
  id: 'set-default' | 'move-up' | 'move-down' | 'reset' | 'delete';
  icon: React.ReactNode;
  label: string;
  supported: boolean;
  disabledReason: string | undefined;
  invoke(): void;
};

export function SettingsCollectionActionMenu(props: {
  canMoveDown: boolean;
  canMoveUp: boolean;
  item: SettingsCollectionItem;
  onAction(action: SettingsCollectionAction): void;
  onMove(intent: SettingsCollectionMoveIntent): void;
  moveDownIntent: SettingsCollectionMoveIntent | null;
  moveUpIntent: SettingsCollectionMoveIntent | null;
  open: boolean;
  onOpenChange(open: boolean): void;
}) {
  const menuId = useId();
  const interaction = useSettingsCollectionActionMenuInteraction(props);
  const disabled = props.item.disabledActions ?? {};
  const actions: readonly MenuAction[] = [
    {
      id: 'set-default',
      icon: <Check size={14} />,
      label: translate('settings.collection.actions.setDefault'),
      supported: props.item.capabilities.setDefault === true,
      disabledReason: disabled['set-default'],
      invoke: () => props.onAction({ type: 'set-default', itemId: props.item.id }),
    },
    {
      id: 'move-up',
      icon: <ChevronUp size={14} />,
      label: translate('settings.collection.actions.moveUp'),
      supported: props.item.capabilities.reorder === true,
      disabledReason: disabled['move-up'] ?? (!props.canMoveUp ? '' : undefined),
      invoke: () => props.moveUpIntent && props.onMove(props.moveUpIntent),
    },
    {
      id: 'move-down',
      icon: <ChevronDown size={14} />,
      label: translate('settings.collection.actions.moveDown'),
      supported: props.item.capabilities.reorder === true,
      disabledReason: disabled['move-down'] ?? (!props.canMoveDown ? '' : undefined),
      invoke: () => props.moveDownIntent && props.onMove(props.moveDownIntent),
    },
    {
      id: 'reset',
      icon: <RotateCcw size={14} />,
      label: props.item.actionLabels?.reset ?? translate('settings.collection.actions.reset'),
      supported: props.item.capabilities.reset === true,
      disabledReason: disabled.reset,
      invoke: () => props.onAction({ type: 'reset', itemId: props.item.id }),
    },
    {
      id: 'delete',
      icon: <Trash2 size={14} />,
      label: translate('settings.collection.actions.delete'),
      supported: props.item.capabilities.delete === true,
      disabledReason: disabled.delete,
      invoke: () => props.onAction({ type: 'delete', itemId: props.item.id }),
    },
  ];
  const supportedActions = actions.filter((action) => action.supported);
  if (supportedActions.length === 0) return null;

  return (
    <div ref={interaction.rootRef} className="relative">
      <button
        ref={interaction.triggerRef}
        type="button"
        aria-label={translate('settings.collection.actions.menu')}
        aria-haspopup="menu"
        aria-expanded={props.open}
        aria-controls={props.open ? menuId : undefined}
        className={[
          'flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-lg',
          'text-[var(--sniptale-color-text-muted)]',
          'hover:bg-[var(--sniptale-color-surface-hover)]',
          'focus-visible:outline-none focus-visible:ring-2',
          'focus-visible:ring-[var(--sniptale-color-focus-ring)]',
        ].join(' ')}
        onClick={() => props.onOpenChange(!props.open)}
      >
        <MoreHorizontal size={16} />
      </button>
      <div
        id={menuId}
        role="menu"
        hidden={!props.open}
        aria-label={translate('settings.collection.actions.menu')}
        className={[
          'absolute right-0 top-9 z-20 min-w-48 rounded-xl border p-1 shadow-lg',
          'border-[var(--sniptale-color-border-soft)]',
          'bg-[var(--sniptale-color-surface-elevated)]',
        ].join(' ')}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            interaction.focusMenuItem(event.key === 'ArrowDown' ? 1 : -1);
          } else if (event.key === 'Home' || event.key === 'End') {
            event.preventDefault();
            interaction.focusMenuItem(event.key === 'Home' ? 'first' : 'last');
          } else if (event.key === 'Tab') {
            props.onOpenChange(false);
          }
        }}
      >
        {supportedActions.map((action) => {
          const isDisabled = props.item.busy === true || action.disabledReason !== undefined;
          return (
            <button
              key={action.id}
              type="button"
              role="menuitem"
              tabIndex={-1}
              disabled={isDisabled}
              title={action.disabledReason || undefined}
              className={[
                'flex min-h-8 w-full items-center gap-2 rounded-lg px-2',
                'text-left text-xs',
                action.id === 'delete'
                  ? 'text-[var(--sniptale-color-text-danger)]'
                  : 'text-[var(--sniptale-color-text)]',
                isDisabled
                  ? 'cursor-not-allowed opacity-45'
                  : 'hover:bg-[var(--sniptale-color-surface-hover)]',
              ].join(' ')}
              onClick={() => {
                action.invoke();
                interaction.closeAndRestoreFocus();
              }}
            >
              {action.icon}
              {action.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
