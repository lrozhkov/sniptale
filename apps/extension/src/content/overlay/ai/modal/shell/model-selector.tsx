import type { ModelSelectorProps } from './types';
import { AIModelSelector } from '../../../../../features/ai/model-selector';
import { isContentEventWithinElement } from '../../../../platform/dom-host';

export function ModelSelector({
  models,
  providers,
  selectedModelId,
  onSelect,
  disabled = false,
}: ModelSelectorProps) {
  return (
    <AIModelSelector
      disabled={disabled}
      isEventWithinElement={isContentEventWithinElement}
      models={models}
      onSelect={onSelect}
      providers={providers}
      selectedModelId={selectedModelId}
    />
  );
}
