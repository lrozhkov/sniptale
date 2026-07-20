import type { AIModalTemplateDraft } from '../shell/types';
import type {
  useAIModalEditorState,
  useAIModalResizeState,
  useAIModalSettingsState,
} from './locals';
import type { PromptTemplatesState } from './prompt-template-state';

function buildAIModalTemplateState(props: {
  handleAddTemplate: () => void;
  handleDeleteTemplate: (template: { id: string }) => Promise<void>;
  handleEditTemplate: (template: AIModalTemplateDraft) => void;
  handleSaveTemplate: (name: string, content: string) => Promise<void>;
  handleSelectTemplate: (template: AIModalTemplateDraft) => Promise<void>;
  templateSubmitError: string | null;
  templates: PromptTemplatesState['templates'];
  templatesLoading: boolean;
}) {
  return {
    handleAddTemplate: props.handleAddTemplate,
    handleDeleteTemplate: props.handleDeleteTemplate,
    handleEditTemplate: props.handleEditTemplate,
    handleSaveTemplate: props.handleSaveTemplate,
    handleSelectTemplate: props.handleSelectTemplate,
    templateSubmitError: props.templateSubmitError,
    templates: props.templates,
    templatesLoading: props.templatesLoading,
  };
}

function buildAIModalEditorUiState(props: {
  editor: ReturnType<typeof useAIModalEditorState>;
  handleResizeStart: (event: React.MouseEvent) => void;
  resize: ReturnType<typeof useAIModalResizeState>;
}) {
  return {
    editingTemplate: props.editor.editingTemplate,
    handleResizeStart: props.handleResizeStart,
    isEditorOpen: props.editor.isEditorOpen,
    isResizing: props.resize.isResizing,
    resizerRef: props.resize.resizerRef,
    setIsEditorOpen: props.editor.setIsEditorOpen,
    textareaRef: props.resize.textareaRef,
  };
}

function buildAIModalSelectionState(props: {
  prompt: string;
  selectedData: string;
  setPrompt: React.Dispatch<React.SetStateAction<string>>;
  setSelectedData: React.Dispatch<React.SetStateAction<string>>;
  totalTokens: number;
}) {
  return {
    prompt: props.prompt,
    selectedData: props.selectedData,
    setPrompt: props.setPrompt,
    setSelectedData: props.setSelectedData,
    totalTokens: props.totalTokens,
  };
}

function buildAIModalModelState(props: {
  handleModelSelect: (modelId: string | null) => void;
  settings: ReturnType<typeof useAIModalSettingsState>;
}) {
  return {
    availableModels: props.settings.availableModels,
    handleModelSelect: props.handleModelSelect,
    providers: props.settings.providers,
    selectedModelId: props.settings.selectedModelId,
  };
}

export function buildAIModalState(props: {
  editor: ReturnType<typeof useAIModalEditorState>;
  handleAddTemplate: () => void;
  handleDeleteTemplate: (template: { id: string }) => Promise<void>;
  handleEditTemplate: (template: AIModalTemplateDraft) => void;
  handleModelSelect: (modelId: string | null) => void;
  handleResizeStart: (event: React.MouseEvent) => void;
  handleSaveTemplate: (name: string, content: string) => Promise<void>;
  handleSelectTemplate: (template: AIModalTemplateDraft) => Promise<void>;
  prompt: string;
  resize: ReturnType<typeof useAIModalResizeState>;
  selectedData: string;
  settings: ReturnType<typeof useAIModalSettingsState>;
  setPrompt: React.Dispatch<React.SetStateAction<string>>;
  setSelectedData: React.Dispatch<React.SetStateAction<string>>;
  templateSubmitError: string | null;
  templates: PromptTemplatesState['templates'];
  templatesLoading: boolean;
  totalTokens: number;
}) {
  return {
    ...buildAIModalTemplateState(props),
    ...buildAIModalEditorUiState(props),
    ...buildAIModalSelectionState(props),
    ...buildAIModalModelState(props),
  };
}
