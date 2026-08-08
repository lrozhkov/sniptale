import { Cpu } from 'lucide-react';

import { translate } from '../../../../../platform/i18n';
import {
  SettingsCollection,
  type SettingsCollectionAction,
  type SettingsCollectionItem,
} from '../../../../section-surface';
import type { AiProvidersSectionState } from '../controller/types';
import { getAiModelPromptLabel } from './helpers';

export function AIProvidersModelsCard(props: { state: AiProvidersSectionState }) {
  const items: readonly SettingsCollectionItem[] = props.state.models.map((model) => ({
    id: model.id,
    title: model.displayName,
    meta: `${props.state.getProviderName(model.providerId)} · ${model.modelCode} · ${getAiModelPromptLabel(model)}`,
    preview: <Cpu size={16} />,
    isDefault: props.state.defaultModelId === model.id,
    capabilities: {
      edit: true,
      setDefault: props.state.defaultModelId !== model.id,
      delete: true,
    },
  }));
  const byId = new Map(props.state.models.map((model) => [model.id, model]));
  const onAction = (action: SettingsCollectionAction) => {
    const model = byId.get(action.itemId);
    if (!model) return;
    if (action.type === 'set-default') void props.state.handleDefaultModelChange(model.id);
    if (action.type === 'edit') props.state.modals.openModelModal(model);
    if (action.type === 'delete')
      props.state.modals.setConfirmDelete({ type: 'model', item: model });
  };
  const hasProviders = props.state.providers.length > 0;
  return (
    <SettingsCollection
      ariaLabel={translate('settings.aiProviders.modelsTitle')}
      title={translate('settings.aiProviders.modelsTitle')}
      items={items}
      emptyState={
        <div>
          <p>{translate('settings.aiProviders.modelsEmptyTitle')}</p>
          <p>
            {translate(
              hasProviders
                ? 'settings.aiProviders.modelsEmptyDescriptionWithProviders'
                : 'settings.aiProviders.modelsEmptyDescriptionNoProviders'
            )}
          </p>
        </div>
      }
      addAction={{
        label: translate('common.actions.add'),
        disabled: !hasProviders,
        onInvoke: () => props.state.modals.openModelModal(),
      }}
      onAction={onAction}
    />
  );
}
