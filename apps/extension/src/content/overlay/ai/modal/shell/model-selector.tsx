import type { ModelSelectorProps } from './types';
import { AIModelSelector } from '../../../../../features/ai/model-selector';
import { isContentEventWithinElement } from '../../../../platform/dom-host';
import { translate } from '../../../../../platform/i18n';

export function ModelSelector({
  models,
  providers,
  selectedModelId,
  onSelect,
  disabled = false,
}: ModelSelectorProps) {
  const missingModel = models.length === 0 || selectedModelId === null;
  return (
    <div className="sniptale-ai-modal-model-field" data-invalid={missingModel || undefined}>
      <AIModelSelector
        disabled={disabled}
        isEventWithinElement={isContentEventWithinElement}
        models={models}
        onSelect={onSelect}
        providers={providers}
        selectedModelId={selectedModelId}
      />
      {missingModel ? (
        <span className="sniptale-ai-modal-model-error" role="alert">
          {translate(models.length === 0 ? 'aiModal.modelsNotConfigured' : 'aiModal.modelRequired')}
        </span>
      ) : null}
    </div>
  );
}
