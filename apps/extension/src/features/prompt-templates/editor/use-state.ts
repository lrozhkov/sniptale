import type React from 'react';
import { useEffect, useRef, useState } from 'react';

import { translate } from '../../../platform/i18n';
import { PromptTemplateSchema } from '../../ai/schemas/public';
import type { PromptTemplateEditorErrors, PromptTemplateEditorProps } from './types';

function validateTemplate(name: string, content: string): PromptTemplateEditorErrors {
  const result = PromptTemplateSchema.safeParse({
    id: 'temp',
    name: name.trim(),
    content: content.trim(),
  });

  if (result.success) {
    return {};
  }

  const nextErrors: PromptTemplateEditorErrors = {};
  result.error.issues.forEach((issue) => {
    if (issue.path[0] === 'name') {
      nextErrors.name =
        issue.code === 'too_big'
          ? translate('templates.editor.nameTooLong')
          : translate('templates.editor.nameRequired');
      return;
    }

    if (issue.path[0] === 'content') {
      nextErrors.content = translate('templates.editor.contentRequired');
    }
  });

  return nextErrors;
}

function resetPromptTemplateEditorState(
  setName: React.Dispatch<React.SetStateAction<string>>,
  setContent: React.Dispatch<React.SetStateAction<string>>,
  setErrors: React.Dispatch<React.SetStateAction<PromptTemplateEditorErrors>>,
  template?: PromptTemplateEditorProps['template']
) {
  if (template) {
    setName(template.name);
    setContent(template.content);
  } else {
    setName('');
    setContent('');
  }

  setErrors({});
}

async function submitTemplateForm(params: {
  content: string;
  name: string;
  onClose: () => void;
  onSave: (name: string, content: string) => Promise<void>;
  setErrors: React.Dispatch<React.SetStateAction<PromptTemplateEditorErrors>>;
}): Promise<boolean> {
  const nextErrors = validateTemplate(params.name, params.content);
  if (nextErrors.name || nextErrors.content) {
    params.setErrors(nextErrors);
    return false;
  }

  try {
    await params.onSave(params.name.trim(), params.content.trim());
    params.onClose();
    return true;
  } catch {
    return false;
  }
}

function handleEditorKeyDown(
  event: Pick<React.KeyboardEvent, 'key' | 'preventDefault'>,
  onClose: () => void
) {
  if (event.key === 'Escape') {
    event.preventDefault();
    onClose();
  }
}

export function usePromptTemplateEditorState({
  isOpen,
  onClose,
  onSave,
  template,
}: Pick<PromptTemplateEditorProps, 'isOpen' | 'onClose' | 'onSave' | 'template'>) {
  const [name, setName] = useState('');
  const [content, setContent] = useState('');
  const [errors, setErrors] = useState<PromptTemplateEditorErrors>({});
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    resetPromptTemplateEditorState(setName, setContent, setErrors, template);
    setTimeout(() => nameInputRef.current?.focus(), 100);
  }, [isOpen, template]);

  const handleSubmit = async (event?: React.FormEvent) => {
    event?.preventDefault();
    return submitTemplateForm({ content, name, onClose, onSave, setErrors });
  };

  return {
    actions: {
      handleKeyDown: (event: Pick<React.KeyboardEvent, 'key' | 'preventDefault'>) =>
        handleEditorKeyDown(event, onClose),
      handleSubmit,
    },
    fields: {
      content,
      name,
      nameInputRef,
      setContent,
      setName,
    },
    validation: {
      errors,
      isDisabled: !name.trim() || !content.trim(),
      setErrors,
    },
  };
}
