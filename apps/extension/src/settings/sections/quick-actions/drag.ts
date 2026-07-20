import type { QuickAction } from '../../../contracts/settings';
import { persistQuickActions, reorderAndSaveQuickActions } from './crud';

export interface QuickActionsDragEvent {
  dataTransfer: {
    dropEffect: string;
    effectAllowed: string;
    setData: (format: string, data: string) => void;
  };
  preventDefault: () => void;
}

export function useQuickActionsDrag(props: {
  actions: QuickAction[];
  draggedId: string | null;
  setActions: (actions: QuickAction[]) => void;
  setDraggedId: (value: string | null) => void;
  setDragOverId: (value: string | null) => void;
}) {
  const handlePersistActions = async (updatedActions: QuickAction[]) =>
    persistQuickActions(updatedActions, props.setActions);

  return {
    handleDragEnd: () => {
      props.setDraggedId(null);
      props.setDragOverId(null);
    },
    handleDragLeave: () => {
      props.setDragOverId(null);
    },
    handleDragOver: (event: QuickActionsDragEvent, actionId: string) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';

      if (actionId !== props.draggedId) {
        props.setDragOverId(actionId);
      }
    },
    handleDragStart: (event: QuickActionsDragEvent, actionId: string) => {
      props.setDraggedId(actionId);
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', actionId);
    },
    handleDrop: async (event: QuickActionsDragEvent, targetId: string) => {
      event.preventDefault();
      await reorderAndSaveQuickActions({
        actions: props.actions,
        draggedId: props.draggedId,
        onPersist: handlePersistActions,
        setDraggedId: props.setDraggedId,
        setDragOverId: props.setDragOverId,
        targetId,
      });
    },
  };
}
