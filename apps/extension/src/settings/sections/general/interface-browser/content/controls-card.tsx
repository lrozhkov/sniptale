import { translate } from '../../../../../platform/i18n';
import { ProductSelect } from '@sniptale/ui/product-form-controls';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { ExternalLink } from 'lucide-react';
import { SettingsControlRow } from '../../../../section-surface';
import { openExtensionShortcutsPage } from '../../../../../platform/navigation/extension-pages';

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

      <SettingsControlRow label={translate('settings.appearance.popupStartupLabel', state.locale)}>
        <ProductSelect
          id="settings-popup-startup"
          value={state.popupStartup.selection}
          onChange={state.popupStartup.updateSelection}
          options={state.popupStartup.options}
          disabled={state.popupStartup.loading}
          aria-label={translate('settings.appearance.popupStartupAriaLabel', state.locale)}
        />
      </SettingsControlRow>

      <SettingsControlRow
        label={translate('settings.appearance.keyboardShortcutsLabel', state.locale)}
        description={translate('settings.appearance.keyboardShortcutsDescription', state.locale)}
      >
        <ProductActionButton
          className="w-full justify-center gap-2"
          compact
          tone="secondary"
          onClick={() => void openExtensionShortcutsPage()}
        >
          {translate('settings.appearance.keyboardShortcutsButton', state.locale)}
          <ExternalLink aria-hidden="true" className="h-4 w-4" />
        </ProductActionButton>
      </SettingsControlRow>

      <div className="pt-1">
        <ContextMenuControls state={state} />
      </div>
    </div>
  );
}
