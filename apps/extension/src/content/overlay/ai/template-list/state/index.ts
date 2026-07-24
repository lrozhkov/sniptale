import { useRef, useState } from 'react';
import type { PromptTemplate } from '../../../../../contracts/settings';
import { useTemplateDragState } from '../drag';
import type { TemplateListProps } from '../types';
import { useTemplateDeleteActions } from './delete';
import { useTemplateListDerivedState } from './derived';
import { useTemplateMenuDismiss } from './menu';
import { useTemplateOrderState } from './order';

export function useTemplateListState({ templates }: Pick<TemplateListProps, 'templates'>) {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const pillRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const { orderedIds, reorder } = useTemplateOrderState(templates);
  const derived = useTemplateListDerivedState({ orderedIds, showAll, templates });

  const drag = useTemplateDragState(pillRefs, reorder);
  useTemplateMenuDismiss(openMenuId, setOpenMenuId, menuRef);
  const deleteActions = useTemplateDeleteActions();

  return {
    cancelDelete: deleteActions.cancelDelete,
    confirmDelete: deleteActions.confirmDelete,
    confirmState: deleteActions.confirmState,
    dragStateRef: drag.dragState,
    draggedId: drag.draggedId,
    dragOverId: drag.dragOverId,
    handleDeleteTemplate: (template: PromptTemplate) =>
      deleteActions.handleDeleteTemplate(template, setOpenMenuId),
    handlePointerDown: drag.handlePointerDown,
    hasMore: derived.hasMore,
    menuRef,
    openMenuId,
    orderedTemplates: derived.orderedTemplates,
    pillRefs,
    setOpenMenuId,
    setShowAll,
    showAll,
    visibleTemplates: derived.visibleTemplates,
  };
}
