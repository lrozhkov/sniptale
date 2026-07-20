interface PromptTemplateEditorTemplate {
  id?: string;
  name: string;
  content: string;
}

export interface PromptTemplateEditorProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (name: string, content: string) => Promise<void>;
  template?: PromptTemplateEditorTemplate;
  isLoading?: boolean;
  submitError?: string | null;
}

export interface PromptTemplateEditorErrors {
  name?: string;
  content?: string;
}
