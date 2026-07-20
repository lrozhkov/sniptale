import { Key, KeyRound, Pencil, Plus, Server, Trash2 } from 'lucide-react';

import { translate } from '../../../../platform/i18n';
import type { AIProvider } from '../../../../contracts/settings';
import { aiProvidersAddButtonClassName, aiProvidersSectionCardClassName } from './constants';
import {
  getSettingsHoverActionsClassName,
  settingsDangerIconButtonClassName,
  settingsInfoIconButtonClassName,
  settingsListRowClassName,
  settingsNeutralBadgeClassName,
} from '../../../section-surface/panel-controls';
import type { AiProvidersSectionState } from '../controller/types';

export function AIProvidersProvidersCard(props: { state: AiProvidersSectionState }) {
  return (
    <section className={aiProvidersSectionCardClassName}>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--sniptale-color-text-primary)]">
          <Server size={16} className="text-[var(--sniptale-color-success)]" />
          {translate('settings.aiProviders.providersTitle')}
        </h3>
        <button
          onClick={() => props.state.modals.openProviderModal()}
          className={aiProvidersAddButtonClassName}
        >
          <Plus size={14} />
          {translate('common.actions.add')}
        </button>
      </div>

      {props.state.providers.length === 0 ? (
        <AIProvidersEmptyState
          icon={<Server size={32} className="mx-auto mb-3 opacity-50" />}
          title={translate('settings.aiProviders.providersEmptyTitle')}
          description={translate('settings.aiProviders.providersEmptyDescription')}
        />
      ) : (
        <div className="space-y-3">
          {props.state.providers.map((provider) => (
            <AIProviderRow
              key={provider.id}
              provider={provider}
              onClearSecret={() => props.state.handleClearProviderSecret(provider.id)}
              onDelete={() =>
                props.state.modals.setConfirmDelete({ type: 'provider', item: provider })
              }
              onEdit={() => props.state.modals.openProviderModal(provider)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function AIProvidersEmptyState(props: {
  description: string;
  icon: React.ReactNode;
  title: string;
}) {
  return (
    <div className="py-8 text-center text-[var(--sniptale-color-text-dim)]">
      {props.icon}
      <p className="text-sm">{props.title}</p>
      <p className="mt-1 text-xs">{props.description}</p>
    </div>
  );
}

function AIProviderRow(props: {
  onClearSecret: () => void;
  onDelete: () => void;
  onEdit: () => void;
  provider: AIProvider;
}) {
  return (
    <div className={settingsListRowClassName}>
      <AIProviderRowMetadata provider={props.provider} />
      <AIProviderRowActions
        hasStoredApiKey={props.provider.hasStoredApiKey}
        onClearSecret={props.onClearSecret}
        onDelete={props.onDelete}
        onEdit={props.onEdit}
      />
    </div>
  );
}

function AIProviderRowMetadata(props: { provider: AIProvider }) {
  return (
    <div className="min-w-0 flex-1">
      <div className="font-medium text-[var(--sniptale-color-text-primary)]">
        {props.provider.name}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--sniptale-color-text-dim)]">
        <span className={settingsNeutralBadgeClassName}>{props.provider.connectionType}</span>
        <span className="truncate font-mono">{props.provider.baseUrl}</span>
      </div>
      <div className="mt-1 flex items-center gap-1 text-xs text-[var(--sniptale-color-text-dim)]">
        <Key size={10} />
        <span>
          {props.provider.hasStoredApiKey
            ? translate('settings.aiProviders.providerApiKeySet')
            : translate('settings.aiProviders.providerApiKeyMissing')}
        </span>
      </div>
    </div>
  );
}

function AIProviderRowActions(props: {
  hasStoredApiKey: boolean;
  onClearSecret: () => void;
  onDelete: () => void;
  onEdit: () => void;
}) {
  return (
    <div className={getSettingsHoverActionsClassName(false)}>
      {props.hasStoredApiKey ? (
        <AIProvidersIconButton
          label={translate('settings.aiProviders.providerSecretClearAction')}
          onClick={props.onClearSecret}
          tone="danger"
        >
          <KeyRound size={14} />
        </AIProvidersIconButton>
      ) : null}
      <AIProvidersIconButton
        label={translate('settings.aiProviders.providerEditAction')}
        onClick={props.onEdit}
        tone="info"
      >
        <Pencil size={14} />
      </AIProvidersIconButton>
      <AIProvidersIconButton
        label={translate('settings.aiProviders.providerDeleteAction')}
        onClick={props.onDelete}
        tone="danger"
      >
        <Trash2 size={14} />
      </AIProvidersIconButton>
    </div>
  );
}

function AIProvidersIconButton(props: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  tone: 'danger' | 'info';
}) {
  const className =
    props.tone === 'info' ? settingsInfoIconButtonClassName : settingsDangerIconButtonClassName;

  return (
    <button
      type="button"
      aria-label={props.label}
      title={props.label}
      onClick={props.onClick}
      className={className}
    >
      {props.children}
    </button>
  );
}
