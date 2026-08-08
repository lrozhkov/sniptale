import { Server } from 'lucide-react';

import { translate } from '../../../../../platform/i18n';
import {
  SettingsCollection,
  type SettingsCollectionAction,
  type SettingsCollectionItem,
} from '../../../../section-surface';
import type { AiProvidersSectionState } from '../controller/types';

export function AIProvidersProvidersCard(props: { state: AiProvidersSectionState }) {
  const items: readonly SettingsCollectionItem[] = props.state.providers.map((provider) => ({
    id: provider.id,
    title: provider.name,
    meta: `${provider.connectionType} · ${provider.baseUrl}`,
    preview: <Server size={16} />,
    badges: [
      {
        id: 'api-key',
        label: translate(
          provider.hasStoredApiKey
            ? 'settings.aiProviders.providerApiKeySet'
            : 'settings.aiProviders.providerApiKeyMissing'
        ),
        tone: provider.hasStoredApiKey ? 'success' : 'warning',
      },
    ],
    capabilities: { edit: true, reset: provider.hasStoredApiKey, delete: true },
    actionLabels: { reset: translate('settings.aiProviders.providerSecretClearAction') },
  }));
  const byId = new Map(props.state.providers.map((provider) => [provider.id, provider]));
  const onAction = (action: SettingsCollectionAction) => {
    const provider = byId.get(action.itemId);
    if (!provider) return;
    if (action.type === 'edit') props.state.modals.openProviderModal(provider);
    if (action.type === 'reset') void props.state.handleClearProviderSecret(provider.id);
    if (action.type === 'delete')
      props.state.modals.setConfirmDelete({ type: 'provider', item: provider });
  };
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
