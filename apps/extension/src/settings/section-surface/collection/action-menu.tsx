import { Check, ChevronDown, ChevronUp, MoreHorizontal, RotateCcw, Trash2 } from 'lucide-react';
import { useId } from 'react';

import { translate } from '../../../platform/i18n';
import { useSettingsCollectionActionMenuInteraction } from './action-menu-interaction';
import type {
  SettingsCollectionAction,
  SettingsCollectionItem,
  SettingsCollectionMoveIntent,
} from './types';

type InlineAction = {
  id: 'set-default' | 'move-up' | 'move-down' | 'reset' | 'delete';
  icon: React.ReactNode;
  label: string;
  supported: boolean;
  disabledReason: string | undefined;
  invoke(): void;
};

function SettingsCollectionInlineActionButton(props: {
  action: InlineAction;
  busy: boolean;
  direct?: boolean;
  revealOnRowInteraction?: boolean;
  onInvoke(): void;
  tabIndex?: number;
}) {
  const isDisabled = props.busy || props.action.disabledReason !== undefined;
  return (
    <button
      data-collection-inline-action={props.action.id}
      data-collection-direct-action={props.direct ? props.action.id : undefined}
      type="button"
      tabIndex={props.tabIndex}
      aria-label={props.action.label}
      disabled={isDisabled}
      title={props.action.disabledReason || props.action.label}
      className={[
        'flex h-8 w-8 flex-none items-center justify-center rounded-lg',
        'focus-visible:outline-none focus-visible:ring-2',
        'focus-visible:ring-[var(--sniptale-color-focus-ring)]',
        props.action.id === 'delete'
          ? 'text-[var(--sniptale-color-text-danger)]'
          : 'text-[var(--sniptale-color-text-muted)]',
        isDisabled
          ? 'cursor-not-allowed opacity-45'
          : 'hover:bg-[var(--sniptale-color-surface-hover)]',
        props.revealOnRowInteraction
          ? [
              'pointer-events-none opacity-0 transition-opacity',
              'group-hover:pointer-events-auto group-hover:opacity-100',
              'group-focus-within:pointer-events-auto group-focus-within:opacity-100',
              'focus-visible:pointer-events-auto focus-visible:opacity-100',
            ].join(' ')
          : '',
      ].join(' ')}
      onClick={props.onInvoke}
    >
      {props.action.icon}
      <span className="sr-only">{props.action.label}</span>
    </button>
  );
}

export function SettingsCollectionActionTray(props: {
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
  const trayId = useId();
  const interaction = useSettingsCollectionActionMenuInteraction(props);
  const disabled = props.item.disabledActions ?? {};
  const actions: readonly InlineAction[] = [
    {
      id: 'set-default',
      icon: <Check size={15} />,
      label: translate('settings.collection.actions.setDefault'),
      supported: props.item.capabilities.setDefault === true,
      disabledReason: disabled['set-default'],
      invoke: () => props.onAction({ type: 'set-default', itemId: props.item.id }),
    },
    {
      id: 'move-up',
      icon: <ChevronUp size={15} />,
      label: translate('settings.collection.actions.moveUp'),
      supported: props.item.capabilities.reorder === true,
      disabledReason: disabled['move-up'] ?? (!props.canMoveUp ? '' : undefined),
      invoke: () => props.moveUpIntent && props.onMove(props.moveUpIntent),
    },
    {
      id: 'move-down',
      icon: <ChevronDown size={15} />,
      label: translate('settings.collection.actions.moveDown'),
      supported: props.item.capabilities.reorder === true,
      disabledReason: disabled['move-down'] ?? (!props.canMoveDown ? '' : undefined),
      invoke: () => props.moveDownIntent && props.onMove(props.moveDownIntent),
    },
    {
      id: 'reset',
      icon: <RotateCcw size={15} />,
      label: props.item.actionLabels?.reset ?? translate('settings.collection.actions.reset'),
      supported: props.item.capabilities.reset === true,
      disabledReason: disabled.reset,
      invoke: () => props.onAction({ type: 'reset', itemId: props.item.id }),
    },
    {
      id: 'delete',
      icon: <Trash2 size={15} />,
      label: translate('settings.collection.actions.delete'),
      supported: props.item.capabilities.delete === true,
      disabledReason: disabled.delete,
      invoke: () => props.onAction({ type: 'delete', itemId: props.item.id }),
    },
  ];
  const supportedActions = actions.filter((action) => action.supported);
  if (supportedActions.length === 0) return null;
  if (supportedActions.length === 1) {
    const action = supportedActions[0]!;
    return (
      <SettingsCollectionInlineActionButton
        action={action}
        busy={props.item.busy === true}
        direct
        revealOnRowInteraction={action.id === 'set-default'}
        onInvoke={action.invoke}
      />
    );
  }

  const triggerLabel = translate('settings.collection.actions.menu');
  return (
    <div
      ref={interaction.rootRef}
      className="flex flex-none items-center"
      onBlur={interaction.onBlur}
      onPointerEnter={interaction.onPointerEnter}
      onPointerLeave={interaction.onPointerLeave}
    >
      <div
        id={trayId}
        role="toolbar"
        aria-hidden={!props.open}
        aria-label={triggerLabel}
        className={[
          'flex overflow-hidden transition-[max-width,opacity,transform] duration-200',
          'motion-reduce:transition-none',
          props.open
            ? 'mr-1 max-w-48 translate-x-0 gap-1 opacity-100'
            : 'pointer-events-none max-w-0 translate-x-1 gap-0 opacity-0',
        ].join(' ')}
      >
        {supportedActions.map((action) => (
          <SettingsCollectionInlineActionButton
            key={action.id}
            action={action}
            busy={props.item.busy === true}
            tabIndex={props.open ? 0 : -1}
            onInvoke={() => {
              action.invoke();
              interaction.closeAndRestoreFocus();
            }}
          />
        ))}
      </div>
      <button
        ref={interaction.triggerRef}
        type="button"
        aria-label={triggerLabel}
        aria-expanded={props.open}
        aria-controls={trayId}
        title={triggerLabel}
        className={[
          'flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg',
          'focus-visible:outline-none focus-visible:ring-2',
          'focus-visible:ring-[var(--sniptale-color-focus-ring)]',
          props.open
            ? 'bg-[var(--sniptale-color-accent-soft)] text-[var(--sniptale-color-accent)]'
            : 'text-[var(--sniptale-color-text-muted)] hover:bg-[var(--sniptale-color-surface-hover)]',
        ].join(' ')}
        onClick={() => props.onOpenChange(!props.open)}
      >
        <MoreHorizontal size={16} />
      </button>
    </div>
  );
}
