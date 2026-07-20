import { useAiProvidersSectionController } from './section/view-model';

/**
 * Owns provider/model settings state, persistence, and modal orchestration.
 */
export function useAiProvidersSection() {
  return useAiProvidersSectionController();
}
