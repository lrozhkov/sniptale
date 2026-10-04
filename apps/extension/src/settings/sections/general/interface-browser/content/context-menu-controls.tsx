import { useRef, useState } from 'react';
import { ContextMenuEditor } from './context-menu-editor';
import { translate } from '../../../../../platform/i18n';
import { SettingsSwitch } from '../../../../section-surface/panel-controls';
import type { AppearanceSectionState } from './types';

/** Global browser-menu switch and the single command-tree editor. */
export function ContextMenuControls({
  state,
  visible = true,
}: {
  state: AppearanceSectionState;
  visible?: boolean;
}) {
  const [status, setStatus] = useState<'idle' | 'saving' | 'failed'>('idle');
  const busy = useRef(false);
  const enabledLabel = translate('settings.appearance.contextMenuEnabledLabel', state.locale);
  const updateEnabled = async () => {
    if (busy.current) return;
    busy.current = true;
    setStatus('saving');
    try {
      await state.updateContextMenu({ enabled: !state.contextMenu.enabled });
      setStatus('idle');
    } catch {
      setStatus('failed');
    } finally {
      busy.current = false;
    }
  };
  return (
    <div className="min-w-0 space-y-4 pb-1 pt-2">
      <div className="flex min-h-10 max-w-[45rem] items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-[var(--sniptale-color-text-primary)]">
            {translate('settings.appearance.contextMenuTitle', state.locale)}
          </h2>
          <p className="mt-0.5 text-xs leading-5 text-[var(--sniptale-color-text-muted)]">
            {translate('settings.appearance.contextMenuEnabledDescription', state.locale)}
          </p>
        </div>
        <SettingsSwitch
          disabled={!visible || status === 'saving'}
          checked={state.contextMenu.enabled}
          size="sm"
          aria-label={enabledLabel}
          title={enabledLabel}
          onClick={() => void updateEnabled()}
        />
      </div>
      {status !== 'idle' ? (
        <p role={status === 'failed' ? 'alert' : 'status'} className="text-sm">
          {translate(
            status === 'failed'
              ? 'settings.appearance.contextMenuSaveFailed'
              : 'settings.appearance.contextMenuSaving',
            state.locale
          )}
        </p>
      ) : null}
      <ContextMenuEditor state={state} visible={visible} />
    </div>
  );
}
