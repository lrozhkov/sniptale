import { requireTrustedAIModalInteraction } from './helpers';
import type { useAIModalState } from '../session';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
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
  onOpen,
}: ModelSelectorProps) {
  const missingModel = models.length === 0 || selectedModelId === null;
  return (
    <div
      className="sniptale-ai-modal-model-field"
      data-invalid={missingModel || undefined}
      onMouseDownCapture={requireTrustedAIModalInteraction}
      onClickCapture={requireTrustedAIModalInteraction}
    >
      <AIModelSelector
        disabled={disabled}
        isEventWithinElement={isContentEventWithinElement}
        models={models}
        onSelect={onSelect}
        {...(onOpen ? { onOpen } : {})}
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

export function AIModalSelectionFeedback({
  selection,
}: {
  selection: ReturnType<typeof useAIModalState>['modelSelection'];
}) {
  return (
    <>
      {selection.selectionPending ? (
        <p role="status" className="mt-2 text-xs">
          {translate('common.states.saving')}
        </p>
      ) : null}
      {selection.selectionUnavailable ? (
        <p role="status" className="mt-2 text-xs">
          {translate('aiModal.modelSelectionUnavailable')}
        </p>
      ) : null}
      {selection.selectionFailed ? (
        <p role="alert" className="mt-2 text-xs text-[var(--sniptale-color-danger)]">
          {translate('aiModal.modelSelectionSaveFailed')}
        </p>
      ) : null}
      {selection.configurationFailed ? (
        <div>
          <p role="alert" className="mt-2 text-xs text-[var(--sniptale-color-danger)]">
            {translate('content.toolbar.aiTextModelsError')}
          </p>
          <ProductActionButton compact onClick={() => void selection.retryConfiguration()}>
            {translate('common.actions.retry')}
          </ProductActionButton>
        </div>
      ) : null}
    </>
  );
}
