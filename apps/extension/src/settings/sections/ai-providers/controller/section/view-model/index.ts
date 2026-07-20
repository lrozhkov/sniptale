import type { AiProvidersSectionState } from '../../types';
import { buildAiProvidersSectionControllerState } from './build';
import { useAiProvidersSectionControllerDependencies } from './dependencies';

export function useAiProvidersSectionController(): AiProvidersSectionState {
  return buildAiProvidersSectionControllerState(useAiProvidersSectionControllerDependencies());
}
