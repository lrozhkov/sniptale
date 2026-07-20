import { useState } from 'react';
import { RotateCcw, Trash2 } from 'lucide-react';

import { translate } from '../../../platform/i18n';
import type { LocalExtensionDataErasureOptions } from '../../../composition/persistence/privacy-erasure';
import {
  getControlSecondaryButtonClassName,
  getFormActionRowClassName,
} from '@sniptale/ui/control-language';
import { requestLocalExtensionDataErasure } from '../../runtime/privacy-erasure-client';
import {
  SettingsSectionHeader,
  settingsPanelClassName,
  settingsSectionClassName,
} from '../../section-surface';

type PrivacyAction = 'delete-local-data' | 'factory-reset';
type PrivacyStatus = { kind: 'error' | 'success'; message: string } | null;

const privacyActionRowClassName = [
  getFormActionRowClassName({ emphasis: 'primary' }),
  'items-start',
].join(' ');

function getActionOptions(action: PrivacyAction): LocalExtensionDataErasureOptions {
  return action === 'delete-local-data'
    ? { includeAiProviderSecrets: false, preservePreferences: true }
    : { includeAiProviderSecrets: true, preservePreferences: false };
}

function getActionLabels(action: PrivacyAction, confirmation: PrivacyAction | null) {
  if (action === 'delete-local-data') {
    return {
      button:
        confirmation === action
          ? translate('settings.privacy.confirmDelete')
          : translate('settings.privacy.startDelete'),
      description: translate('settings.privacy.deleteLocalDataDescription'),
      title: translate('settings.privacy.deleteLocalDataTitle'),
    };
  }

  return {
    button:
      confirmation === action
        ? translate('settings.privacy.confirmFactoryReset')
        : translate('settings.privacy.startFactoryReset'),
    description: translate('settings.privacy.factoryResetDescription'),
    title: translate('settings.privacy.factoryResetTitle'),
  };
}

function PrivacyActionRow(props: {
  action: PrivacyAction;
  confirmation: PrivacyAction | null;
  disabled: boolean;
  onRun: (action: PrivacyAction) => void;
}) {
  const labels = getActionLabels(props.action, props.confirmation);
  const Icon = props.action === 'delete-local-data' ? Trash2 : RotateCcw;

  return (
    <div className={privacyActionRowClassName}>
      <div className="flex min-w-0 gap-3">
        <Icon className="mt-0.5 h-5 w-5 shrink-0 text-[var(--sniptale-color-danger)]" />
        <div className="min-w-0 space-y-1">
          <h2 className="text-sm font-semibold text-[var(--sniptale-color-text-primary-strong)]">
            {labels.title}
          </h2>
          <p className="max-w-2xl text-sm leading-6 text-[var(--sniptale-color-text-secondary)]">
            {labels.description}
          </p>
        </div>
      </div>
      <button
        type="button"
        disabled={props.disabled}
        className={getControlSecondaryButtonClassName({ tone: 'danger' })}
        onClick={() => props.onRun(props.action)}
      >
        {props.disabled ? translate('settings.privacy.working') : labels.button}
      </button>
    </div>
  );
}

function PrivacyStatusMessage({ status }: { status: PrivacyStatus }) {
  if (!status) {
    return null;
  }

  const color =
    status.kind === 'success'
      ? 'text-[var(--sniptale-color-success)]'
      : 'text-[var(--sniptale-color-danger)]';
  return <p className={['text-sm font-medium', color].join(' ')}>{status.message}</p>;
}

function usePrivacyErasureActions() {
  const [confirmation, setConfirmation] = useState<PrivacyAction | null>(null);
  const [runningAction, setRunningAction] = useState<PrivacyAction | null>(null);
  const [status, setStatus] = useState<PrivacyStatus>(null);

  async function runConfirmedAction(action: PrivacyAction): Promise<void> {
    const options = getActionOptions(action);
    setRunningAction(action);
    setStatus(null);
    try {
      await requestLocalExtensionDataErasure(options);
      setConfirmation(null);
      setStatus({ kind: 'success', message: translate('settings.privacy.success') });
    } catch (error) {
      setStatus({
        kind: 'error',
        message: error instanceof Error ? error.message : translate('settings.privacy.error'),
      });
    } finally {
      setRunningAction(null);
    }
  }

  function handleAction(action: PrivacyAction): void {
    if (confirmation !== action) {
      setConfirmation(action);
      setStatus(null);
      return;
    }

    void runConfirmedAction(action);
  }

  return { confirmation, handleAction, runningAction, status };
}

function PrivacyDataClasses() {
  return (
    <div className="space-y-2">
      <h2 className="text-sm font-semibold text-[var(--sniptale-color-text-primary-strong)]">
        {translate('settings.privacy.dataClassesTitle')}
      </h2>
      <p className="max-w-3xl text-sm leading-6 text-[var(--sniptale-color-text-secondary)]">
        {translate('settings.privacy.dataClasses')}
      </p>
    </div>
  );
}

export function PrivacySection() {
  const { confirmation, handleAction, runningAction, status } = usePrivacyErasureActions();

  return (
    <section className={settingsSectionClassName}>
      <SettingsSectionHeader
        kicker={translate('settings.privacy.kicker')}
        title={translate('settings.privacy.title')}
        description={translate('settings.privacy.description')}
      />

      <div className={[settingsPanelClassName, 'space-y-5'].join(' ')}>
        <PrivacyDataClasses />
        <PrivacyActionRow
          action="delete-local-data"
          confirmation={confirmation}
          disabled={runningAction !== null}
          onRun={handleAction}
        />
        <PrivacyActionRow
          action="factory-reset"
          confirmation={confirmation}
          disabled={runningAction !== null}
          onRun={handleAction}
        />
        <PrivacyStatusMessage status={status} />
      </div>
    </section>
  );
}
