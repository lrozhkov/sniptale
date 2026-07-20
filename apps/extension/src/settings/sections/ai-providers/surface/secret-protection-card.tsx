import { ShieldCheck } from 'lucide-react';

import { translate } from '../../../../platform/i18n';
import { SettingsSwitch } from '../../../section-surface/panel-controls';
import {
  settingsNeutralBadgeClassName,
  settingsSuccessBadgeClassName,
} from '../../../section-surface';
import type { AiProvidersSectionState } from '../controller/types';
import { aiProvidersSectionCardClassName } from './constants';
import { SecretProtectionActions } from './secret-protection-actions';

type SecretProtectionState = AiProvidersSectionState['secretProtection'];

function getSecretProtectionStatusText(state: SecretProtectionState): string {
  if (!state.status.isEnabled) {
    return translate('settings.aiProviders.secretProtectionOffStatus');
  }

  return state.status.isUnlocked
    ? translate('settings.aiProviders.secretProtectionUnlockedStatus')
    : translate('settings.aiProviders.secretProtectionLockedStatus');
}

function getSecretProtectionDescription(state: SecretProtectionState): string {
  return state.status.isEnabled
    ? translate('settings.aiProviders.secretProtectionPassphraseDescription')
    : translate('settings.aiProviders.secretProtectionTransparentDescription');
}

function SecretProtectionMeta(props: { state: SecretProtectionState }) {
  const modeLabel = props.state.status.isEnabled
    ? translate('settings.aiProviders.secretProtectionPassphraseMode')
    : translate('settings.aiProviders.secretProtectionTransparentMode');
  const sessionLabel = props.state.status.isUnlocked
    ? translate('settings.aiProviders.secretProtectionSessionUnlocked')
    : translate('settings.aiProviders.secretProtectionSessionLocked');

  return (
    <div className="mt-4 flex flex-wrap gap-2">
      <span className={settingsNeutralBadgeClassName}>
        {translate('settings.aiProviders.secretProtectionModeLabel')}: {modeLabel}
      </span>
      <span
        className={
          props.state.status.isUnlocked
            ? settingsSuccessBadgeClassName
            : settingsNeutralBadgeClassName
        }
      >
        {translate('settings.aiProviders.secretProtectionSessionLabel')}: {sessionLabel}
      </span>
    </div>
  );
}

export function AIProvidersSecretProtectionCard(props: { state: AiProvidersSectionState }) {
  const { secretProtection } = props.state;

  return (
    <section className={aiProvidersSectionCardClassName}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-sm font-semibold text-[var(--sniptale-color-text-primary)]">
            <ShieldCheck size={16} className="text-[var(--sniptale-color-success)]" />
            {translate('settings.aiProviders.secretProtectionTitle')}
          </div>
          <p className="mt-1 text-xs leading-5 text-[var(--sniptale-color-text-dim)]">
            {getSecretProtectionDescription(secretProtection)}
          </p>
          <p className="mt-2 text-xs text-[var(--sniptale-color-text-muted)]">
            {getSecretProtectionStatusText(secretProtection)}
          </p>
          <SecretProtectionMeta state={secretProtection} />
        </div>
        <SettingsSwitch
          aria-label={translate('settings.aiProviders.secretProtectionTitle')}
          checked={secretProtection.status.isEnabled}
          disabled={secretProtection.isBusy}
          onClick={
            secretProtection.status.isEnabled
              ? secretProtection.handleOpenDisableDialog
              : secretProtection.handleOpenEnableDialog
          }
        />
      </div>
      <SecretProtectionActions state={secretProtection} />
    </section>
  );
}
