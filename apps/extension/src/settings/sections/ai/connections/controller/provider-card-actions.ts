import { useState } from 'react';
import { browserPermissions } from '@sniptale/platform/browser/permissions';
import type { AIProvider } from '../../../../../contracts/settings';
import { translate } from '../../../../../platform/i18n';
import {
  refreshAIProviderCatalog,
  setAIProviderEnabled,
} from '../../../../runtime/ai-settings/mutations';
import type { SettingsCollectionAction } from '../../../../section-surface';
import type { AiProvidersSectionState } from './types';

/** Owns disposable provider-card operation state and explicit Settings actions. */
export function useProviderCardActions(
  state: Pick<AiProvidersSectionState, 'providers' | 'reloadData' | 'modals' | 'catalogActions'>
) {
  const [{ refreshing, errors }, setStatus] = useState<{
    refreshing: ReadonlySet<string>;
    errors: Record<string, string>;
  }>({ refreshing: new Set(), errors: {} });
  const check = async (provider: AIProvider) => {
    if (refreshing.has(provider.id)) return;
    setStatus((current) => ({
      refreshing: new Set([...current.refreshing, provider.id]),
      errors: { ...current.errors, [provider.id]: '' },
    }));
    try {
      if (provider.observation?.reason === 'host-permission-required') {
        await browserPermissions.request({ origins: [`${new URL(provider.baseUrl).origin}/*`] });
      }
      await refreshAIProviderCatalog(provider.id);
      await state.reloadData();
    } catch {
      setStatus((current) => ({
        ...current,
        errors: {
          ...current.errors,
          [provider.id]: translate('settings.aiProviders.providerCheckFailed'),
        },
      }));
    } finally {
      setStatus((current) => ({
        ...current,
        refreshing: new Set([...current.refreshing].filter((id) => id !== provider.id)),
      }));
    }
  };
  const byId = new Map(state.providers.map((provider) => [provider.id, provider]));
  const onAction = (action: SettingsCollectionAction) => {
    const provider = byId.get(action.itemId);
    if (!provider) return;
    if (action.type === 'toggle') {
      if (!provider.incarnation) {
        setStatus((current) => ({
          ...current,
          errors: { ...current.errors, [provider.id]: translate('common.errors.saveFailed') },
        }));
        return;
      }
      void setAIProviderEnabled(provider.id, provider.incarnation, action.nextChecked)
        .then(state.reloadData)
        .catch(() =>
          setStatus((current) => ({
            ...current,
            errors: { ...current.errors, [provider.id]: translate('common.errors.saveFailed') },
          }))
        );
    }
    if (action.type === 'edit') state.modals.openProviderModal(provider);
    if (action.type === 'reset') void state.catalogActions.clearProviderSecret(provider.id);
    if (action.type === 'delete')
      state.modals.setConfirmDelete({ type: 'provider', item: provider });
  };
  return { refreshing, errors, check, onAction };
}
