import type { AIModalProps } from '../shell/types';
import { useAIModalControllerState } from './controller';
import { useAIModalCoreState } from './core-state';

export function useAIModalState({ isOpen }: Pick<AIModalProps, 'isOpen'>) {
  const core = useAIModalCoreState();
  return useAIModalControllerState({ core, isOpen });
}
