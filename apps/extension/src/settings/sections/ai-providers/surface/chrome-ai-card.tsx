import { Bot } from 'lucide-react';

import { translate } from '../../../../platform/i18n';
import type { AiProvidersSectionState } from '../controller/types';
import { aiProvidersSectionCardClassName } from './constants';
import { SettingsSwitch } from '../../../section-surface/panel-controls';
import { settingsToggleRowClassName } from '../../../section-surface';

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
    <section className={aiProvidersSectionCardClassName}>
      <div className={settingsToggleRowClassName}>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-sm font-semibold text-[var(--sniptale-color-text-primary)]">
            <Bot size={16} className="text-[var(--sniptale-color-success)]" />
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
    </section>
  );
}
