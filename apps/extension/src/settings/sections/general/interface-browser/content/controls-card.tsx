import { translate } from '../../../../../platform/i18n';
import { ProductSelect } from '@sniptale/ui/product-form-controls';
import { SettingsControlRow } from '../../../../section-surface';

import type { AppearanceSectionState } from './types';
import { ContextMenuControls } from './context-menu-controls';
import { ThemeChips } from './theme-chips';

export function AppearanceControlsCard({ state }: { state: AppearanceSectionState }) {
  return (
    <div className="space-y-1">
      <SettingsControlRow label={translate('settings.appearance.themeModeLabel', state.locale)}>
        <ThemeChips state={state} />
      </SettingsControlRow>

      <SettingsControlRow
        label={translate('settings.appearance.languagePreferenceLabel', state.locale)}
      >
        <ProductSelect
          id="settings-interface-language"
          value={state.languagePreference}
          onChange={state.setLanguagePreference}
          options={state.localeOptions}
          aria-label={translate('settings.appearance.languageSelectAriaLabel', state.locale)}
        />
      </SettingsControlRow>

      <div className="pt-1">
        <ContextMenuControls state={state} />
      </div>
    </div>
  );
}
