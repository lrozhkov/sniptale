import type { MouseEvent } from 'react';
import type { PromptTemplate } from '../../../../../contracts/settings';

export function blurPromptIfFocused() {
  if (document.activeElement instanceof HTMLTextAreaElement) {
    document.activeElement.blur();
  }
}

export function createTemplateMenuClickHandler(
  callback: (template: PromptTemplate) => void,
  template: PromptTemplate
) {
  return (event: MouseEvent) => {
    event.stopPropagation();
    callback(template);
  };
}

export function createTemplateSelectHandler(props: {
  dragStateMoved: boolean;
  onSelectTemplate: (template: PromptTemplate) => void;
  template: PromptTemplate;
}) {
  return (event: MouseEvent) => {
    blurPromptIfFocused();

    if (props.dragStateMoved) {
      event.preventDefault();
      return;
    }

    props.onSelectTemplate(props.template);
  };
}

export function getTemplatePillClasses(props: {
  isDragOver: boolean;
  isDragging: boolean;
  isLoading: boolean;
  isMenuOpen: boolean;
}) {
  return [
    'sniptale-template-pill',
    props.isMenuOpen && 'menu-open',
    props.isDragOver && 'drag-over',
    props.isDragging && 'dragging',
    props.isLoading && 'loading',
  ]
    .filter(Boolean)
    .join(' ');
}
