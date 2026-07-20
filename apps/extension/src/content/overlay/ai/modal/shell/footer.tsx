import { useId } from 'react';

import { translate } from '../../../../../platform/i18n';
import { ProductModalFooter } from '@sniptale/ui/product-modal';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { ModelSelector } from './model-selector';
import { AIModalSubmitTip } from './submit-tip';
import type { useAIModalState } from '../session';

export function AIModalFooter({
  availableModels,
  disabledSubmit,
  isLoading,
  onClose,
  onSelectModel,
  onSubmit,
  providers,
  selectedModelId,
  totalTokens,
}: {
  availableModels: ReturnType<typeof useAIModalState>['availableModels'];
  disabledSubmit: boolean;
  isLoading: boolean;
  onClose: () => void;
  onSelectModel: (modelId: string | null) => void;
  onSubmit: () => void;
  providers: ReturnType<typeof useAIModalState>['providers'];
  selectedData: ReturnType<typeof useAIModalState>['selectedData'];
  selectedModelId: string | null;
  totalTokens: number;
}) {
  return (
    <ProductModalFooter>
      <AIModalTokenCounter totalTokens={totalTokens} />
      <ModelSelector
        models={availableModels}
        providers={providers}
        selectedModelId={selectedModelId}
        onSelect={onSelectModel}
        disabled={isLoading}
      />
      <AIModalFooterActions
        availableModels={availableModels}
        disabledSubmit={disabledSubmit}
        isLoading={isLoading}
        onClose={onClose}
        onSubmit={onSubmit}
        providers={providers}
        selectedModelId={selectedModelId}
      />
    </ProductModalFooter>
  );
}

function AIModalTokenCounter({ totalTokens }: { totalTokens: number }) {
  return (
    <div className="sniptale-ai-modal-footer-meta">
      <div className="sniptale-token-counter">
        <svg
          className="sniptale-ai-modal-token-icon"
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect width="18" height="18" x="3" y="3" rx="2" />
          <path d="M7 7h10" />
          <path d="M7 12h10" />
          <path d="M7 17h4" />
        </svg>
        <span className="sniptale-ai-modal-token-text">
          ~{totalTokens} {translate('aiModal.tokensSuffix')}
        </span>
      </div>
    </div>
  );
}

function AIModalFooterActions({
  availableModels,
  disabledSubmit,
  isLoading,
  onClose,
  onSubmit,
  providers,
  selectedModelId,
}: {
  availableModels: ReturnType<typeof useAIModalState>['availableModels'];
  disabledSubmit: boolean;
  isLoading: boolean;
  onClose: () => void;
  onSubmit: () => void;
  providers: ReturnType<typeof useAIModalState>['providers'];
  selectedModelId: string | null;
}) {
  const submitTipId = useId();

  return (
    <div className="sniptale-ai-modal-footer-actions">
      <ProductActionButton onClick={onClose} disabled={isLoading} tone="secondary">
        {translate('aiModal.cancelButton')}
      </ProductActionButton>
      <span className="sniptale-ai-modal-submit-tip-anchor">
        <ProductActionButton
          aria-describedby={submitTipId}
          onClick={onSubmit}
          disabled={disabledSubmit}
          tone="primary"
        >
          {isLoading ? <AIModalLoadingLabel /> : <AIModalSubmitLabel />}
        </ProductActionButton>
        <AIModalSubmitTip
          availableModels={availableModels}
          id={submitTipId}
          providers={providers}
          selectedModelId={selectedModelId}
        />
      </span>
    </div>
  );
}

function AIModalLoadingLabel() {
  return (
    <>
      <div className="sniptale-spinner-inline" />
      {translate('aiModal.processingButton')}
    </>
  );
}

function AIModalSubmitLabel() {
  return (
    <>
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <line x1="22" y1="2" x2="11" y2="13" />
        <polygon points="22 2 15 22 11 13 2 9 22 2" />
      </svg>
      {translate('aiModal.submitButton')}
    </>
  );
}
