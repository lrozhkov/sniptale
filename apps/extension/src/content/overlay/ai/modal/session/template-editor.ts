import type React from 'react';
import type { AIModalTemplateDraft } from '../shell/types';

export function createTemplateAddHandler(props: {
  setEditingTemplate: React.Dispatch<React.SetStateAction<AIModalTemplateDraft | undefined>>;
  setIsEditorOpen: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  return () => {
    props.setEditingTemplate(undefined);
    props.setIsEditorOpen(true);
  };
}

export function createTemplateEditHandler(props: {
  setEditingTemplate: React.Dispatch<React.SetStateAction<AIModalTemplateDraft | undefined>>;
  setIsEditorOpen: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  return (template: AIModalTemplateDraft) => {
    props.setEditingTemplate({ id: template.id, name: template.name, content: template.content });
    props.setIsEditorOpen(true);
  };
}
