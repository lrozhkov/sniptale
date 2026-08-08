import { translate } from '../../../../../platform/i18n';
import { ProductSelect } from '@sniptale/ui/product-form-controls';

import { settingsCardClassName } from '../../../../section-surface/panel-controls';
import { settingsDividerClassName, settingsMetaLabelClassName } from '../../../../section-surface';

import type { AppearanceSectionState } from './types';
import { ContextMenuControls } from './context-menu-controls';
import { ThemeChips } from './theme-chips';

const appearanceControlsCardClassName = [settingsCardClassName, 'space-y-5'].join(' ');
export function AppearanceControlsCard({ state }: { state: AppearanceSectionState }) {
  return (
    <div className={appearanceControlsCardClassName}>
      <div>
        <div className={settingsMetaLabelClassName}>
          {translate('settings.appearance.themeModeLabel', state.locale)}
        </div>
        <div className="mt-3">
          <ThemeChips state={state} />
        </div>
        <p className="mt-3 text-xs text-[var(--sniptale-color-text-dim)]">
          {translate('settings.appearance.themeModeHint', state.locale)}
        </p>
      </div>

      <div>
        <div className={settingsDividerClassName} />
        <div className="pt-5">
          <div className={settingsMetaLabelClassName}>
            {translate('settings.appearance.languagePreferenceLabel', state.locale)}
          </div>
          <div className="mt-3 max-w-sm">
            <ProductSelect
              value={state.languagePreference}
              onChange={state.setLanguagePreference}
              options={state.localeOptions}
              aria-label={translate('settings.appearance.languageSelectAriaLabel', state.locale)}
            />
          </div>
        </div>
      </div>

      <div>
        <div className={settingsDividerClassName} />
        <div className="pt-5">
          <ContextMenuControls state={state} />
        </div>
      </div>
    </div>
  );
}
