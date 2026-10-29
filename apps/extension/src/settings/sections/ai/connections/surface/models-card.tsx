import { getAIModelOperation } from '../../../../../contracts/settings/model-operation';
import { useState } from 'react';

import { translate } from '../../../../../platform/i18n';
import {
  SettingsCollection,
  type SettingsCollectionAction,
  type SettingsCollectionItem,
} from '../../../../section-surface';
import type { AiProvidersSectionState } from '../controller/types';
import { getAiModelPromptLabel } from './helpers';

export function AIProvidersModelsCard(props: { state: AiProvidersSectionState }) {
  const [movingModelId, setMovingModelId] = useState<string | null>(null);
  const items: readonly SettingsCollectionItem[] = props.state.models.map((model) => {
    const purpose =
      getAIModelOperation(model) === 'text'
        ? getAiModelPromptLabel(model)
        : translate(
            model.operation === 'transcription'
              ? 'settings.aiProviders.modelOperationTranscription'
              : 'settings.aiProviders.modelOperationSpeech'
          );
    return {
      id: model.id,
      title: model.displayName,
      meta: `${props.state.getProviderName(model.providerId)} · ${model.modelCode} · ${purpose}`,
      busy: movingModelId === model.id,
      capabilities: {
        edit: true,
        delete: true,
        reorder: true,
      },
    };
  });
  const byId = new Map(props.state.models.map((model) => [model.id, model]));
  const onAction = (action: SettingsCollectionAction) => {
    const model = byId.get(action.itemId);
    if (!model) return;
    if (action.type === 'edit') props.state.modals.openModelModal(model);
    if (action.type === 'delete')
      props.state.modals.setConfirmDelete({ type: 'model', item: model });
  };
  const hasProviders = props.state.providers.length > 0;
  const hasAutomaticProviders = props.state.providers.some(
    (provider) => provider.management === 'automatic'
  );
  return (
    <SettingsCollection
      ariaLabel={translate('settings.aiProviders.modelsTitle')}
      title={translate('settings.aiProviders.modelsTitle')}
      items={items}
      emptyState={
        <div>
          <p>
            {translate(
              hasAutomaticProviders
                ? 'settings.aiProviders.manualModelsEmptyTitle'
                : 'settings.aiProviders.modelsEmptyTitle'
            )}
          </p>
          <p>
            {translate(
              hasAutomaticProviders
                ? 'settings.aiProviders.modelsAutomaticDescription'
                : hasProviders
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
      onMove={(intent) => {
        if (movingModelId !== null) return;
        setMovingModelId(intent.itemId);
        return props.state.catalogActions
          .moveModel(intent.itemId, intent.beforeItemId)
          .finally(() => setMovingModelId(null));
      }}
    />
  );
}
