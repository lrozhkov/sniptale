import { handleAiProviderSecretClear } from '../provider-secret-actions';

export function useAiProvidersProviderSecretActions(props: { reloadData: () => Promise<void> }) {
  return {
    handleClearProviderSecret: (providerId: string) =>
      handleAiProviderSecretClear({ providerId, reloadData: props.reloadData }),
  };
}
