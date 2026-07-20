import type React from 'react';
import { blurPromptIfFocused } from '../helpers';
import type { TemplateListState } from '../types';

export function stopTemplateMenuEvent(event: React.MouseEvent) {
  event.stopPropagation();
  blurPromptIfFocused();
}

export function createTemplateMenuToggleHandler(props: {
  isMenuOpen: boolean;
  setOpenMenuId: React.Dispatch<React.SetStateAction<string | null>>;
  templateId: string;
}) {
  return (event: React.MouseEvent) => {
    event.stopPropagation();
    props.setOpenMenuId(props.isMenuOpen ? null : props.templateId);
  };
}

export function updateTemplatePillRefs(props: {
  element: HTMLDivElement | null;
  isMenuOpen: boolean;
  state: TemplateListState;
  templateId: string;
}) {
  if (props.element) {
    props.state.pillRefs.current.set(props.templateId, props.element);
  } else {
    props.state.pillRefs.current.delete(props.templateId);
  }

  if (props.isMenuOpen) {
    (props.state.menuRef as React.MutableRefObject<HTMLDivElement | null>).current = props.element;
  }
}
