import { translate } from '../../../../../platform/i18n';
import type { AiProvidersSectionState } from '../controller/types';
import { SettingsSwitch } from '../../../../section-surface/panel-controls';
import {
  settingsCompactWorkbenchClassName,
  settingsPanelClassName,
  settingsToggleRowClassName,
} from '../../../../section-surface';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';

function getChromeAiStatusCopy(state: AiProvidersSectionState['chromeAi']): string {
  if (state.isChecking) {
    return translate('settings.aiProviders.chromeAiChecking');
  }
  if (state.isSettingUp) {
    return state.setupProgress === null
      ? translate('settings.aiProviders.chromeAiPreparing')
      : `${translate('settings.aiProviders.chromeAiPreparing')} ${state.setupProgress}%`;
  }
  if (state.error) {
    return state.error;
  }
  if (state.enabled) {
    return translate('settings.aiProviders.chromeAiEnabledDescription');
  }
  if (state.availability === 'available') {
    return translate('settings.aiProviders.chromeAiAvailable');
  }
  if (state.availability === 'downloadable' || state.availability === 'downloading') {
    return translate('settings.aiProviders.chromeAiDownloadable');
  }

  return translate('settings.aiProviders.chromeAiUnsupported');
}

export function AIProvidersChromeAiCard(props: { state: AiProvidersSectionState }) {
  const { chromeAi } = props.state;
  const disabled =
    chromeAi.isChecking ||
    chromeAi.isSettingUp ||
    (!chromeAi.enabled &&
      (chromeAi.availability === 'unsupported' || chromeAi.availability === 'unavailable'));

  return (
    <section className={`${settingsCompactWorkbenchClassName} ${settingsPanelClassName}`}>
      <div className={settingsToggleRowClassName}>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-[var(--sniptale-color-text-primary)]">
            {translate('settings.aiProviders.chromeAiTitle')}
          </div>
          <div className="mt-1 text-xs text-[var(--sniptale-color-text-dim)]">
            {translate('settings.aiProviders.chromeAiDescription')}
          </div>
          <div className="mt-2 text-xs text-[var(--sniptale-color-text-muted)]">
            {getChromeAiStatusCopy(chromeAi)}
          </div>
        </div>
        <SettingsSwitch
          aria-label={translate('settings.aiProviders.chromeAiTitle')}
          checked={chromeAi.enabled}
          disabled={disabled}
          onClick={() => void chromeAi.handleToggle()}
        />
      </div>
      <div className="flex flex-wrap items-center gap-3 pt-3">
        <ProductActionButton
          compact
          tone="secondary"
          disabled={
            !chromeAi.enabled ||
            chromeAi.isChecking ||
            chromeAi.isSettingUp ||
            chromeAi.testStatus === 'running'
          }
          onClick={() => void chromeAi.handleTest()}
        >
          {chromeAi.testStatus === 'running'
            ? translate('settings.aiProviders.chromeAiTestRunning')
            : translate('settings.aiProviders.chromeAiTestAction')}
        </ProductActionButton>
        {chromeAi.testStatus === 'success' ? (
          <span className="text-xs text-[var(--sniptale-color-success)]">
            {translate('settings.aiProviders.chromeAiTestSuccess')}
          </span>
        ) : null}
      </div>
    </section>
  );
}
