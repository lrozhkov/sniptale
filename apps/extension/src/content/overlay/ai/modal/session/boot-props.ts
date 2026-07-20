import type { AIProviderSelectorEntry } from '../../../../../contracts/messaging/ai-settings-runtime';
import type { AIModel } from '../../../../../contracts/settings';
import type { AIModalCoreState } from './core-state';

export interface AIModalOpenBootstrapEffectProps {
  bootedWhileOpenRef: React.MutableRefObject<boolean>;
  isOpen: boolean;
  lastPrompt: string;
  prompt: string;
  setAvailableModels: React.Dispatch<React.SetStateAction<AIModel[]>>;
  setGlobalSystemPrompt: React.Dispatch<React.SetStateAction<string>>;
  setPrompt: React.Dispatch<React.SetStateAction<string>>;
  setProviders: React.Dispatch<React.SetStateAction<AIProviderSelectorEntry[]>>;
  setSelectedModelId: React.Dispatch<React.SetStateAction<string | null>>;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
}

export interface AIModalBootEffectProps extends Omit<
  AIModalOpenBootstrapEffectProps,
  'bootedWhileOpenRef'
> {
  setLastPrompt: (prompt: string) => void;
}

export function createAIModalBootEffectArgs(props: { core: AIModalCoreState; isOpen: boolean }) {
  return {
    isOpen: props.isOpen,
    lastPrompt: props.core.lastPrompt,
    prompt: props.core.prompt,
    setAvailableModels: props.core.settings.setAvailableModels as React.Dispatch<
      React.SetStateAction<AIModel[]>
    >,
    setGlobalSystemPrompt: props.core.settings.setGlobalSystemPrompt as React.Dispatch<
      React.SetStateAction<string>
    >,
    setLastPrompt: props.core.setLastPrompt,
    setPrompt: props.core.setPrompt,
    setProviders: props.core.settings.setProviders as React.Dispatch<
      React.SetStateAction<AIProviderSelectorEntry[]>
    >,
    setSelectedModelId: props.core.settings.setSelectedModelId as React.Dispatch<
      React.SetStateAction<string | null>
    >,
    textareaRef: props.core.resize.textareaRef as React.RefObject<HTMLTextAreaElement | null>,
  };
}
