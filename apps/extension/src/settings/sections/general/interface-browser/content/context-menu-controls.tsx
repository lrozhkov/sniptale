import { useRef, useState } from 'react';
import { ContextMenuEditor } from './context-menu-editor';
import { Check } from 'lucide-react';

import { translate } from '../../../../../platform/i18n';
import { SettingsSwitch } from '../../../../section-surface/panel-controls';

import type { AppearanceSectionState } from './types';

function ContextMenuItem(props: {
  checked: boolean;
  disabled: boolean;
  label: string;
  onToggle(): void;
}) {
  return (
    <button
      type="button"
      aria-label={props.label}
      aria-pressed={props.checked}
      disabled={props.disabled}
      onClick={props.onToggle}
      className={[
        'group flex min-h-10 min-w-0 items-center gap-2.5 rounded-lg px-2.5 py-2 text-left',
        'text-sm text-[var(--sniptale-color-text-secondary)] transition-colors',
        'hover:bg-[var(--sniptale-color-surface-hover)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sniptale-color-focus-ring)]',
        'disabled:cursor-not-allowed disabled:opacity-45',
      ].join(' ')}
      title={props.label}
    >
      <span
        aria-hidden="true"
        className={[
          'flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px]',
          'transition-colors',
          props.checked
            ? 'bg-[var(--sniptale-color-accent)] text-white'
            : [
                'bg-[var(--sniptale-color-surface-canvas)]',
                'ring-1 ring-inset ring-[var(--sniptale-color-border-soft)]',
              ].join(' '),
        ].join(' ')}
      >
        {props.checked ? <Check size={12} strokeWidth={2.5} /> : null}
      </span>
      <span className="min-w-0 truncate">{props.label}</span>
    </button>
  );
}

export function ContextMenuControls({
  state,
  visible = true,
}: {
  state: AppearanceSectionState;
  visible?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState<'idle' | 'saving' | 'failed'>('idle');
  const busy = useRef(false);
  const editButton = useRef<HTMLButtonElement>(null);
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  const update = async (patch: Parameters<typeof state.updateContextMenu>[0]) => {
    if (busy.current) return;
    busy.current = true;
    setStatus('saving');
    try {
      await state.updateContextMenu(patch);
      setStatus('idle');
    } catch {
      setStatus('failed');
    } finally {
      busy.current = false;
    }
  };
  if (editing)
    return (
      <ContextMenuEditor
        state={state}
        visible={visible}
        onClose={() => {
          setEditing(false);
          requestAnimationFrame(() => {
            if (visibleRef.current) editButton.current?.focus();
          });
        }}
      />
    );
  const enabledLabel = translate('settings.appearance.contextMenuEnabledLabel', state.locale);
  return (
    <div className="pb-1 pt-2">
      <div className="flex min-h-10 max-w-[34rem] items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-[var(--sniptale-color-text-primary)]">
            {translate('settings.appearance.contextMenuTitle', state.locale)}
          </h2>
          <p className="mt-0.5 text-xs leading-5 text-[var(--sniptale-color-text-muted)]">
            {translate('settings.appearance.contextMenuEnabledDescription', state.locale)}
          </p>
        </div>
        <SettingsSwitch
          disabled={status === 'saving'}
          checked={state.contextMenu.enabled}
          size="sm"
          aria-label={enabledLabel}
          title={enabledLabel}
          onClick={() => {
            void update({ enabled: !state.contextMenu.enabled });
          }}
        />
      </div>

      <button
        ref={editButton}
        type="button"
        disabled={status === 'saving'}
        className={[
          'mt-3 rounded-lg px-3 py-2 text-sm hover:bg-[var(--sniptale-color-surface-hover)]',
          'focus-visible:ring-2 focus-visible:ring-[var(--sniptale-color-focus-ring)] disabled:opacity-45',
        ].join(' ')}
        onClick={() => setEditing(true)}
      >
        {translate('settings.appearance.contextMenuCustomize', state.locale)}
      </button>
      {status !== 'idle' && (
        <p role={status === 'failed' ? 'alert' : 'status'} className="text-sm">
          {translate(
            status === 'failed'
              ? 'settings.appearance.contextMenuSaveFailed'
              : 'settings.appearance.contextMenuSaving',
            state.locale
          )}
        </p>
      )}
      <div className="mt-3 max-w-[34rem]">
        <div
          className={[
            'mb-1 px-2.5 text-[11px] font-semibold uppercase tracking-[0.08em]',
            'text-[var(--sniptale-color-text-muted)]',
          ].join(' ')}
        >
          {translate('settings.appearance.contextMenuVisibleItemsLabel', state.locale)}
        </div>
        <div
          className={[
            'grid gap-x-2 gap-y-0.5 sm:grid-cols-2',
            state.contextMenu.enabled ? '' : 'opacity-60',
          ].join(' ')}
        >
          {state.contextMenuOptions.map((option) => (
            <ContextMenuItem
              key={option.key}
              checked={state.contextMenu[option.key]}
              disabled={!state.contextMenu.enabled || status === 'saving'}
              label={option.label}
              onToggle={() => {
                if (!state.contextMenu.enabled) return;
                void update({
                  [option.key]: !state.contextMenu[option.key],
                });
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
