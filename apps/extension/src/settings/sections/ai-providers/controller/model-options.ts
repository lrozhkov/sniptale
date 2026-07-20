import { translate } from '../../../../platform/i18n';
import type { AIModel } from '../../../../contracts/settings';

function buildAiProvidersModelOptionLabel(args: {
  getProviderName: (providerId: string) => string;
  model: AIModel;
}) {
  return `${args.getProviderName(args.model.providerId)} / ${args.model.displayName}`;
}

export function buildAiProvidersModelOptions(props: {
  getProviderName: (providerId: string) => string;
  models: AIModel[];
}) {
  return [
    { value: '', label: translate('settings.aiProviders.defaultModelUnsetOption') },
    ...props.models.map((model) => ({
      value: model.id,
      label: buildAiProvidersModelOptionLabel({
        getProviderName: props.getProviderName,
        model,
      }),
    })),
  ];
}
