import { translate } from '../../../../../platform/i18n';
import { ProductModalFooter } from '@sniptale/ui/product-modal';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { Settings2 } from 'lucide-react';
import { ModelSelector } from './model-selector';
import type { useAIModalState } from '../session';
import { openAIModalSettings } from './settings-navigation';

export function AIModalFooter({
  availableModels,
  disabledSubmit,
  isLoading,
  onClose,
  onSelectModel,
  onSubmit,
  providers,
  selectedModelId,
  selectedData,
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
  const disclosureHint = getAIModalDisclosureHint({
    availableModels,
    providers,
    selectedData,
    selectedModelId,
  });
  return (
    <ProductModalFooter>
      <AIModalTokenCounter totalTokens={totalTokens} />
      <div className="sniptale-ai-modal-model-controls">
        <ModelSelector
          models={availableModels}
          providers={providers}
          selectedModelId={selectedModelId}
          onSelect={onSelectModel}
          disabled={isLoading}
        />
        <button
          aria-label={translate('aiModal.openModelSettings')}
          className="sniptale-ai-modal-inline-settings"
          onClick={(event) =>
            void openAIModalSettings({ section: 'ai-connections' }, event.nativeEvent)
          }
          title={translate('aiModal.openModelSettings')}
          type="button"
        >
          <Settings2 aria-hidden="true" size={14} />
        </button>
      </div>
      <div className="sniptale-ai-modal-footer-actions">
        <ProductActionButton onClick={onClose} tone="secondary">
          {translate('aiModal.cancelButton')}
        </ProductActionButton>
        <ProductActionButton
          disabled={disabledSubmit}
          onClick={onSubmit}
          title={disclosureHint}
          tone="primary"
        >
          {translate('aiModal.submitShortcutTitle')}
        </ProductActionButton>
      </div>
    </ProductModalFooter>
  );
}

function getAIModalDisclosureHint({
  availableModels,
  providers,
  selectedData,
  selectedModelId,
}: {
  availableModels: ReturnType<typeof useAIModalState>['availableModels'];
  providers: ReturnType<typeof useAIModalState>['providers'];
  selectedData: string;
  selectedModelId: string | null;
}): string {
  const model = availableModels.find((candidate) => candidate.id === selectedModelId);
  const provider = providers.find((candidate) => candidate.id === model?.providerId);
  const destination =
    provider?.connectionType === 'chrome-built-in'
      ? translate('aiModal.disclosureLocalDestination')
      : (provider?.name ?? translate('aiModal.disclosureExternalDestination'));
  const summary = translate('aiModal.disclosureSummary')
    .replace(
      '{data}',
      selectedData
        ? translate('aiModal.disclosureSelectedData')
        : translate('aiModal.disclosureNoPageData')
    )
    .replace('{destination}', destination)
    .replace('{model}', model?.displayName ?? translate('aiModal.modelNotSelected'));
  return `${summary} ${translate('aiModal.disclosureHistory')}`;
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
