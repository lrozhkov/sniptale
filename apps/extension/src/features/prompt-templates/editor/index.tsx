import React from 'react';

import { PromptTemplateEditorContent } from './content';
import type { PromptTemplateEditorProps } from './types';
import { usePromptTemplateEditorState } from './use-state';

/**
 * Shared product modal for editing prompt templates across runtime surfaces.
 */
export const PromptTemplateEditor: React.FC<PromptTemplateEditorProps> = (props) => {
  const state = usePromptTemplateEditorState(props);

  if (!props.isOpen) {
    return null;
  }

  return <PromptTemplateEditorContent {...props} state={state} />;
};
