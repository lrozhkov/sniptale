import { useProviderCardActions } from '../controller/provider-card-actions';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { Plus, RefreshCw } from 'lucide-react';
import { getAIProviderDefinition } from '../../../../../contracts/settings/ai-provider';
import { ProviderCatalogDetails } from './provider-catalog-details';
import { providerStatus } from './provider-status';
import { translate } from '../../../../../platform/i18n';
import { SettingsCollection, type SettingsCollectionItem } from '../../../../section-surface';
import type { AiProvidersSectionState } from '../controller/types';

export function AIProvidersProvidersCard(props: { state: AiProvidersSectionState }) {
  const { refreshing, errors, check, onAction } = useProviderCardActions(props.state);
  const items: readonly SettingsCollectionItem[] = props.state.providers.map((provider) => ({
    id: provider.id,
    title: provider.name,
    meta: `${getAIProviderDefinition(provider.connectionType).label} · ${provider.baseUrl}`,
    enabled: provider.enabled !== false,
    actions: (
      <div className="flex shrink-0 items-center gap-1">
        <ContentToolbarButton
          tone="utility"
          aria-label={translate(
            refreshing.has(provider.id)
              ? 'settings.aiProviders.providerCheckPending'
              : 'settings.aiProviders.providerCheckAction'
          )}
          title={translate(
            refreshing.has(provider.id)
              ? 'settings.aiProviders.providerCheckPending'
              : 'settings.aiProviders.providerCheckAction'
          )}
          disabled={refreshing.has(provider.id) || provider.enabled === false}
          aria-busy={refreshing.has(provider.id) || undefined}
          onClick={() => void check(provider)}
        >
          <RefreshCw
            size={14}
            className={refreshing.has(provider.id) ? 'animate-spin motion-reduce:animate-none' : ''}
          />
        </ContentToolbarButton>
        <ContentToolbarButton
          tone="utility"
          aria-label={translate('settings.aiProviders.providerConfigureModel')}
          title={translate('settings.aiProviders.providerConfigureModel')}
          onClick={() => props.state.modals.openModelModal(undefined, provider.id)}
        >
          <Plus size={14} />
        </ContentToolbarButton>
      </div>
    ),
    footer: (
      <div className="space-y-1 text-[12px] leading-4 text-[var(--sniptale-color-text-secondary)]">
        <p className="m-0" data-provider-status>
          {providerStatus(provider)}
        </p>
        <ProviderCatalogDetails provider={provider} models={props.state.catalogModels} />
        {errors[provider.id] ? (
          <p role="alert" className="m-0 text-[var(--sniptale-color-danger-text)]">
            {errors[provider.id]}
          </p>
        ) : null}
      </div>
    ),
    badges: [
      {
        id: 'management',
        label: translate(
          provider.management === 'manual'
            ? 'settings.aiProviders.providerModeManual'
            : 'settings.aiProviders.providerModeAutomatic'
        ),
        tone: 'neutral',
      },
      {
        id: 'api-key',
        label: translate(
          getAIProviderDefinition(provider.connectionType).credential === 'none' &&
            !provider.hasStoredApiKey
            ? 'settings.aiProviders.providerLocalNoKey'
            : provider.hasStoredApiKey
              ? 'settings.aiProviders.providerApiKeySet'
              : 'settings.aiProviders.providerApiKeyMissing'
        ),
        tone: provider.hasStoredApiKey
          ? 'success'
          : getAIProviderDefinition(provider.connectionType).credential === 'none'
            ? 'neutral'
            : 'warning',
      },
    ],
    capabilities: { edit: true, toggle: true, reset: provider.hasStoredApiKey, delete: true },
    actionLabels: { reset: translate('settings.aiProviders.providerSecretClearAction') },
  }));
  return (
    <SettingsCollection
      ariaLabel={translate('settings.aiProviders.providersTitle')}
      title={translate('settings.aiProviders.providersTitle')}
      items={items}
      emptyState={
        <div>
          <p>{translate('settings.aiProviders.providersEmptyTitle')}</p>
          <p>{translate('settings.aiProviders.providersEmptyDescription')}</p>
        </div>
      }
      addAction={{
        label: translate('common.actions.add'),
        onInvoke: () => props.state.modals.openProviderModal(),
      }}
      onAction={onAction}
    />
  );
}
