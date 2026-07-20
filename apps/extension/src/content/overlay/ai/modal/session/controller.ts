import { buildAIModalState, createAIModalActionHandlers } from './build';
import { createAIModalActionHandlerArgs } from './action-props';
import { useAIModalBootEffect } from './boot';
import { createAIModalBootEffectArgs } from './boot-props';
import { createAIModalViewStateArgs } from './view-props';
import type { AIModalCoreState } from './core-state';

export function useAIModalControllerState(props: { core: AIModalCoreState; isOpen: boolean }) {
  useAIModalBootEffect(createAIModalBootEffectArgs(props));
  const actions = createAIModalActionHandlers(createAIModalActionHandlerArgs(props.core));
  return buildAIModalState(createAIModalViewStateArgs(props.core, actions));
}
