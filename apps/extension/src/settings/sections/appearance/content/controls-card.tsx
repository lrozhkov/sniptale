import { translate } from '../../../../platform/i18n';
import { ProductSelect } from '@sniptale/ui/product-form-controls';

import { settingsCardClassName } from '../../../section-surface/panel-controls';
import { settingsDividerClassName, settingsMetaLabelClassName } from '../../../section-surface';

import type { AppearanceSectionState } from './types';
import { ContextMenuControls } from './context-menu-controls';
import { AppearanceSwitchRow } from './switch-row';
import { ThemeChips } from './theme-chips';

const appearanceControlsCardClassName = [settingsCardClassName, 'space-y-5'].join(' ');
const authenticatedSnapshotAssetsWarningClassName = [
  'mt-2 rounded-md border border-[var(--sniptale-color-warning)]',
  'bg-[var(--sniptale-color-warning-soft)] px-3 py-2 text-xs leading-relaxed',
  'text-[var(--sniptale-color-text-main)]',
].join(' ');

function AuthenticatedSnapshotAssetsWarning({ state }: { state: AppearanceSectionState }) {
  if (!state.authenticatedSnapshotAssetsEnabled) {
    return null;
  }

  return (
    <p className={authenticatedSnapshotAssetsWarningClassName}>
      {translate('settings.appearance.authenticatedSnapshotAssetsWarning', state.locale)}
    </p>
  );
}

function CapturePrivacyControls({ state }: { state: AppearanceSectionState }) {
  return (
    <div>
      <div className={settingsMetaLabelClassName}>
        {translate('settings.appearance.capturePrivacyTitle', state.locale)}
      </div>
      <div className="mt-3">
        <AppearanceSwitchRow
          checked={state.authenticatedSnapshotAssetsEnabled}
          description={translate(
            'settings.appearance.authenticatedSnapshotAssetsDescription',
            state.locale
          )}
          label={translate('settings.appearance.authenticatedSnapshotAssetsLabel', state.locale)}
          tone="primary"
          onToggle={() => {
            void state.updateAuthenticatedSnapshotAssetsEnabled(
              !state.authenticatedSnapshotAssetsEnabled
            );
          }}
        />
        <AuthenticatedSnapshotAssetsWarning state={state} />
        <AppearanceSwitchRow
          checked={state.anonymousCrossOriginSnapshotAssetsEnabled}
          description={translate(
            'settings.appearance.anonymousCrossOriginSnapshotAssetsDescription',
            state.locale
          )}
          label={translate(
            'settings.appearance.anonymousCrossOriginSnapshotAssetsLabel',
            state.locale
          )}
          onToggle={() => {
            void state.updateAnonymousCrossOriginSnapshotAssetsEnabled(
              !state.anonymousCrossOriginSnapshotAssetsEnabled
            );
          }}
        />
      </div>
    </div>
  );
}

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
          <CapturePrivacyControls state={state} />
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
