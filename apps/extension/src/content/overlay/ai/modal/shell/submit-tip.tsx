import { translate } from '../../../../../platform/i18n';
import type { useAIModalState } from '../session';

type AIModalProviderKind = 'chrome-built-in' | 'external' | 'local-custom';

type AIModalSubmitTipProps = {
  availableModels: ReturnType<typeof useAIModalState>['availableModels'];
  id: string;
  providers: ReturnType<typeof useAIModalState>['providers'];
  selectedModelId: string | null;
};

function resolveProviderKind(args: AIModalSubmitTipProps): AIModalProviderKind {
  const model = args.availableModels.find((candidate) => candidate.id === args.selectedModelId);
  const provider = args.providers.find((candidate) => candidate.id === model?.providerId);

  if (provider?.connectionType === 'chrome-built-in') {
    return 'chrome-built-in';
  }

  if (provider?.destinationKind === 'local-custom') {
    return 'local-custom';
  }

  return 'external';
}

export function AIModalSubmitTip(props: AIModalSubmitTipProps) {
  const providerKind = resolveProviderKind(props);

  return (
    <div
      className="sniptale-ai-modal-submit-tip"
      data-ui="ai-modal.submit-tip"
      id={props.id}
      role="tooltip"
    >
      <div className="sniptale-ai-modal-submit-tip-title">
        {translate('aiModal.disclosureTitle')}
      </div>
      <p className="sniptale-ai-modal-submit-tip-copy">
        {translate('aiModal.disclosurePayloadCopy')}
      </p>
      <p className="sniptale-ai-modal-submit-tip-copy">
        {providerKind === 'external'
          ? translate('aiModal.disclosureExternalCopy')
          : translate('aiModal.disclosureLocalCopy')}
      </p>
      <p className="sniptale-ai-modal-submit-tip-copy">
        {translate('aiModal.disclosureHistoryCopy')}
      </p>
    </div>
  );
}
