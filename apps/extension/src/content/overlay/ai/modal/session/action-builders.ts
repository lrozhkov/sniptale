import type { AIModalTemplateDraft } from '../shell/types';
import type {
  useAIModalEditorState,
  useAIModalResizeState,
  useAIModalSettingsState,
} from './locals';
import type { PromptTemplatesState } from './prompt-template-state';

export type AIModalActionBuilderProps = {
  addTemplate: PromptTemplatesState['addTemplate'];
  createModelSelectHandler: (
    setSelectedModelId: React.Dispatch<React.SetStateAction<string | null>>
  ) => (modelId: string | null) => void;
  createResizeStartHandler: (props: {
    setIsResizing: React.Dispatch<React.SetStateAction<boolean>>;
    textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  }) => (event: React.MouseEvent) => void;
  createTemplateAddHandler: (props: {
    setEditingTemplate: React.Dispatch<React.SetStateAction<AIModalTemplateDraft | undefined>>;
    setIsEditorOpen: React.Dispatch<React.SetStateAction<boolean>>;
  }) => () => void;
  createTemplateDeleteHandler: (
    removeTemplate: (id: string) => Promise<void>
  ) => (template: { id: string }) => Promise<void>;
  createTemplateEditHandler: (props: {
    setEditingTemplate: React.Dispatch<React.SetStateAction<AIModalTemplateDraft | undefined>>;
    setIsEditorOpen: React.Dispatch<React.SetStateAction<boolean>>;
  }) => (template: AIModalTemplateDraft) => void;
  createTemplateSaveHandler: (props: {
    addTemplate: (name: string, content: string) => Promise<void>;
    editingTemplate: AIModalTemplateDraft | undefined;
    updateTemplate: (id: string, draft: { name: string; content: string }) => Promise<void>;
  }) => (name: string, content: string) => Promise<void>;
  createTemplateSelectHandler: (props: {
    prompt: string;
    selectTemplate: (template: AIModalTemplateDraft) => Promise<string>;
    setPrompt: React.Dispatch<React.SetStateAction<string>>;
    textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  }) => (template: AIModalTemplateDraft) => Promise<void>;
  editor: ReturnType<typeof useAIModalEditorState>;
  prompt: string;
  removeTemplate: PromptTemplatesState['removeTemplate'];
  resize: ReturnType<typeof useAIModalResizeState>;
  selectTemplate: PromptTemplatesState['selectTemplate'];
  setPrompt: React.Dispatch<React.SetStateAction<string>>;
  settings: ReturnType<typeof useAIModalSettingsState>;
  updateTemplate: PromptTemplatesState['updateTemplate'];
};

export function buildTemplateEditorActions(props: AIModalActionBuilderProps) {
  return {
    handleAddTemplate: props.createTemplateAddHandler({
      setEditingTemplate: props.editor.setEditingTemplate,
      setIsEditorOpen: props.editor.setIsEditorOpen,
    }),
    handleDeleteTemplate: props.createTemplateDeleteHandler(props.removeTemplate),
    handleEditTemplate: props.createTemplateEditHandler({
      setEditingTemplate: props.editor.setEditingTemplate,
      setIsEditorOpen: props.editor.setIsEditorOpen,
    }),
  };
}

export function buildAIModalSelectionActions(props: AIModalActionBuilderProps) {
  return {
    handleModelSelect: props.createModelSelectHandler(props.settings.setSelectedModelId),
    handleResizeStart: props.createResizeStartHandler({
      setIsResizing: props.resize.setIsResizing,
      textareaRef: props.resize.textareaRef,
    }),
  };
}

export function buildTemplatePersistenceActions(props: AIModalActionBuilderProps) {
  return {
    handleSaveTemplate: props.createTemplateSaveHandler({
      addTemplate: props.addTemplate,
      editingTemplate: props.editor.editingTemplate,
      updateTemplate: props.updateTemplate,
    }),
    handleSelectTemplate: props.createTemplateSelectHandler({
      prompt: props.prompt,
      selectTemplate: props.selectTemplate,
      setPrompt: props.setPrompt,
      textareaRef: props.resize.textareaRef,
    }),
  };
}
