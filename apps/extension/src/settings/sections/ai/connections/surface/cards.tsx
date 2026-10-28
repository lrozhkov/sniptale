import { useProviderCardActions } from '../controller/provider-card-actions';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
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
    supplement: (
      <div className="space-y-1">
        <ProviderCatalogDetails
          provider={provider}
          models={props.state.catalogModels}
          onConfigureModel={() => props.state.modals.openModelModal(undefined, provider.id)}
        />
        <ProductActionButton
          compact
          tone="secondary"
          disabled={refreshing.has(provider.id) || provider.enabled === false}
          onClick={() => void check(provider)}
        >
          {translate(
            refreshing.has(provider.id)
              ? 'settings.aiProviders.providerCheckPending'
              : 'settings.aiProviders.providerCheckAction'
          )}
        </ProductActionButton>
        {errors[provider.id] && (
          <p role="alert" className="text-xs">
            {errors[provider.id]}
          </p>
        )}
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
        id: 'status',
        label: providerStatus(provider),
        tone:
          provider.observation?.status === 'available'
            ? 'success'
            : provider.observation?.status === 'unavailable'
              ? 'warning'
              : 'neutral',
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
