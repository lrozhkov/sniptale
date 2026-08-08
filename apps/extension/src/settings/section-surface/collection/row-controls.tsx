import { Pencil } from 'lucide-react';

import { translate } from '../../../platform/i18n';
import { SettingsDragHandle, SettingsSwitch } from '../panel-controls';
import type { SettingsCollectionAction, SettingsCollectionItem } from './types';

export function SettingsCollectionReorderHandle(props: {
  active: boolean;
  dragInstructionsId: string;
  item: SettingsCollectionItem;
  onDragEnd(): void;
  onDragStart(itemId: string): void;
  onKeyboardMove(itemId: string, direction: -1 | 1): void;
  onKeyboardCancel(): void;
  onKeyboardToggle(itemId: string): void;
}) {
  return (
    <button
      type="button"
      aria-label={translate('settings.collection.dragHandle')}
      aria-describedby={props.dragInstructionsId}
      aria-pressed={props.active}
      disabled={props.item.busy}
      draggable={!props.item.busy}
      className={[
        'rounded focus-visible:outline-none focus-visible:ring-2',
        'focus-visible:ring-[var(--sniptale-color-focus-ring)]',
      ].join(' ')}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && props.active) {
          event.preventDefault();
          props.onKeyboardCancel();
        } else if (event.key === ' ' || event.key === 'Enter') {
          event.preventDefault();
          props.onKeyboardToggle(props.item.id);
        } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
          event.preventDefault();
          props.onKeyboardMove(props.item.id, event.key === 'ArrowUp' ? -1 : 1);
        }
      }}
      onDragStart={() => props.onDragStart(props.item.id)}
      onDragEnd={props.onDragEnd}
    >
      <SettingsDragHandle className="pointer-events-none" />
    </button>
  );
}

export function SettingsCollectionPrimaryActions(props: {
  item: SettingsCollectionItem;
  onAction(action: SettingsCollectionAction): void;
}) {
  const { item, onAction } = props;
  return (
    <>
      {item.capabilities.toggle ? (
        <SettingsSwitch
          checked={item.enabled !== false}
          size="sm"
          aria-label={translate(
            item.enabled === false
              ? 'settings.collection.actions.enable'
              : 'settings.collection.actions.disable'
          )}
          disabled={item.busy || item.disabledActions?.toggle !== undefined}
          title={item.disabledActions?.toggle}
          onClick={() =>
            onAction({
              type: 'toggle',
              itemId: item.id,
              nextChecked: item.enabled === false,
            })
          }
        />
      ) : null}
      {item.capabilities.edit ? (
        <button
          type="button"
          aria-label={translate('settings.collection.actions.edit')}
          title={item.disabledActions?.edit}
          disabled={item.busy || item.disabledActions?.edit !== undefined}
          className={[
            'flex h-8 w-8 items-center justify-center rounded-lg',
            'text-[var(--sniptale-color-text-muted)]',
            'hover:bg-[var(--sniptale-color-surface-hover)]',
            'focus-visible:outline-none focus-visible:ring-2',
            'focus-visible:ring-[var(--sniptale-color-focus-ring)] disabled:opacity-45',
          ].join(' ')}
          onClick={() => onAction({ type: 'edit', itemId: item.id })}
        >
          <Pencil size={14} />
        </button>
      ) : null}
    </>
  );
}
