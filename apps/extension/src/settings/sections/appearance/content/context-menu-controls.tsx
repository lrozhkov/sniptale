import { translate } from '../../../../platform/i18n';
import { settingsMetaLabelClassName } from '../../../section-surface';

import type { AppearanceSectionState } from './types';
import { AppearanceSwitchRow } from './switch-row';
import { CONTEXT_MENU_BACKGROUND_CLASS_NAME } from './styles.constants';

export function ContextMenuControls({ state }: { state: AppearanceSectionState }) {
  return (
    <div className="space-y-3">
      <div>
        <div className={settingsMetaLabelClassName}>
          {translate('settings.appearance.contextMenuTitle', state.locale)}
        </div>
      </div>
      <AppearanceSwitchRow
        checked={state.contextMenu.enabled}
        label={translate('settings.appearance.contextMenuEnabledLabel', state.locale)}
        tone="primary"
        onToggle={() => {
          void state.updateContextMenu({ enabled: !state.contextMenu.enabled });
        }}
      />
      <div
        className={[
          'rounded-[18px] border p-2',
          'border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_72%,transparent)]',
          CONTEXT_MENU_BACKGROUND_CLASS_NAME,
          'shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--sniptale-color-border-subtle)_24%,transparent)]',
        ].join(' ')}
      >
        <div className="divide-y divide-[color:color-mix(in_srgb,var(--sniptale-color-border-subtle)_70%,transparent)]">
          {state.contextMenuOptions.map((option) => (
            <div key={option.key} className="py-0.5 first:pt-0 last:pb-0">
              <AppearanceSwitchRow
                checked={state.contextMenu[option.key]}
                disabled={!state.contextMenu.enabled}
                label={option.label}
                onToggle={() => {
                  if (!state.contextMenu.enabled) {
                    return;
                  }

                  void state.updateContextMenu({
                    [option.key]: !state.contextMenu[option.key],
                  });
                }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
