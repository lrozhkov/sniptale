import { saveAiProvidersDefaultModel } from '../../save';

export function createAiProvidersDefaultModelChangeHandler(
  setDefaultModelId: (value: string | null) => void
) {
  return async (value: string) => {
    await saveAiProvidersDefaultModel(value || null, setDefaultModelId);
  };
}
