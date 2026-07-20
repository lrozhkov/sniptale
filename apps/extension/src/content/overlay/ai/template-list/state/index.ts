import { useCallback, useRef, useState } from 'react';
import type { PromptTemplate } from '../../../../../contracts/settings';
import { useTemplateDragState } from '../drag';
import { findTemplateIdUnderPoint } from '../drag/targets';
import type { TemplateListProps } from '../types';
import {
  useTemplateDeleteActions,
  useTemplateListDerivedState,
  useTemplateMenuDismiss,
  useTemplateOrderState,
} from './hooks';

export function useTemplateListState({ templates }: Pick<TemplateListProps, 'templates'>) {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const pillRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const { orderedIds, setOrderedIds } = useTemplateOrderState(templates);
  const derived = useTemplateListDerivedState({ orderedIds, showAll, templates });
  const findIdUnderPoint = useCallback((x: number, y: number): string | null => {
    return findTemplateIdUnderPoint(pillRefs.current, x, y);
  }, []);

  const drag = useTemplateDragState(findIdUnderPoint, setOrderedIds);
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
