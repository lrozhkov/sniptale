import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { Pencil } from 'lucide-react';

import { translate } from '../../../platform/i18n';
import { settingsPendingControlClassName } from '../classes';
import { SettingsDragHandle, SettingsSwitch } from '../panel-controls';
import type { SettingsCollectionAction, SettingsCollectionItem } from './types';

export function SettingsCollectionReorderHandle(props: {
  active: boolean;
  dragInstructionsId: string;
  item: SettingsCollectionItem;
  onPointerStart(
    itemId: string,
    pointerId: number,
    clientX: number,
    clientY: number,
    root: HTMLElement | null
  ): void;
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
      title={translate('settings.collection.dragHandle')}
      aria-disabled={props.item.busy || undefined}
      className={[
        'touch-none rounded focus-visible:outline-none focus-visible:ring-2',
        'aria-disabled:cursor-wait',
        'focus-visible:ring-[var(--sniptale-color-focus-ring)]',
      ].join(' ')}
      onKeyDown={(event) => {
        if (props.item.busy) {
          if (['Escape', ' ', 'Enter', 'ArrowUp', 'ArrowDown'].includes(event.key))
            event.preventDefault();
          return;
        }
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
      onPointerDown={(event) => {
        if (event.button !== 0 || props.item.busy) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture?.(event.pointerId);
        props.onPointerStart(
          props.item.id,
          event.pointerId,
          event.clientX,
          event.clientY,
          event.currentTarget.closest<HTMLElement>('[data-settings-collection-root]')
        );
      }}
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
  const toggleLabel = translate(
    item.enabled === false
      ? 'settings.collection.actions.enable'
      : 'settings.collection.actions.disable'
  );
  const editLabel = translate('settings.collection.actions.edit');
  return (
    <>
      {item.capabilities.toggle ? (
        <SettingsSwitch
          checked={item.enabled !== false}
          size="sm"
          aria-label={toggleLabel}
          disabled={item.busy || item.disabledActions?.toggle !== undefined}
          className={
            item.busy && item.disabledActions?.toggle === undefined
              ? settingsPendingControlClassName
              : undefined
          }
          title={item.disabledActions?.toggle ?? toggleLabel}
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
        <ContentToolbarButton
          tone="utility"
          type="button"
          aria-label={editLabel}
          title={item.disabledActions?.edit ?? editLabel}
          disabled={item.busy || item.disabledActions?.edit !== undefined}
          className={[
            'flex !h-8 !w-8 !p-0 items-center justify-center rounded-[4px]',
            'text-[var(--sniptale-color-text-muted)]',
            'hover:bg-[var(--sniptale-color-surface-hover)]',
            'focus-visible:outline-none focus-visible:ring-2',
            'focus-visible:ring-[var(--sniptale-color-focus-ring)] disabled:opacity-45',
            item.busy && item.disabledActions?.edit === undefined
              ? settingsPendingControlClassName
              : '',
          ].join(' ')}
          onClick={() => onAction({ type: 'edit', itemId: item.id })}
        >
          <Pencil size={14} />
        </ContentToolbarButton>
      ) : null}
    </>
  );
}
