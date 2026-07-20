import type React from 'react';
import type { AIModalTemplateDraft } from '../shell/types';

export function createTemplateSelectHandler(props: {
  selectTemplate: (template: AIModalTemplateDraft) => Promise<string>;
  setPrompt: React.Dispatch<React.SetStateAction<string>>;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
}) {
  return async (template: AIModalTemplateDraft) => {
    const content = await props.selectTemplate(template);
    const textarea = props.textareaRef.current;

    if (textarea && document.activeElement === textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      props.setPrompt((currentPrompt) => {
        return currentPrompt.substring(0, start) + content + currentPrompt.substring(end);
      });
      textarea.selectionStart = textarea.selectionEnd = start + content.length;
      textarea.blur();
      return;
    }

    props.setPrompt((currentPrompt) => {
      return currentPrompt ? `${content}\n\n${currentPrompt}` : content;
    });
  };
}

export function createModelSelectHandler(
  setSelectedModelId: React.Dispatch<React.SetStateAction<string | null>>
) {
  return (modelId: string | null) => {
    setSelectedModelId(modelId);
  };
}

export function createResizeStartHandler(props: {
  setIsResizing: React.Dispatch<React.SetStateAction<boolean>>;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
}) {
  return (event: Pick<React.MouseEvent, 'clientY' | 'preventDefault'>) => {
    event.preventDefault();
    const textarea = props.textareaRef.current;
    if (!textarea) {
      return;
    }

    props.setIsResizing(true);
    const startY = event.clientY;
    const startHeight = textarea.clientHeight;
    const handleMouseMove = (moveEvent: MouseEvent) => {
      const nextHeight = Math.max(56, startHeight + (moveEvent.clientY - startY));
      textarea.style.height = `${nextHeight}px`;
    };
    const handleMouseUp = () => {
      props.setIsResizing(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };
}
