import type { AIProviderSelectorEntry } from '../../../../../contracts/messaging/ai-settings-runtime';
import type { AIModel } from '../../../../../contracts/settings';
import type { ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';

export interface AIModalProps {
  isOpen: boolean;
  onCancelLoading?: () => void;
  onClose: () => void;
  onSubmit: (prompt: string, selectedData?: string, modelId?: string | null) => void;
  isLoading?: boolean;
  treeData?: ParsedDOMTree | null;
}

export interface AIModalTemplateDraft {
  id: string;
  name: string;
  content: string;
}

export interface ModelSelectorProps {
  models: AIModel[];
  providers: AIProviderSelectorEntry[];
  selectedModelId: string | null;
  onSelect: (modelId: string | null) => void;
  disabled?: boolean;
}
