import type { QuickAction } from '../../../../contracts/settings';
import { reorderQuickActions } from '../section/helpers';

export async function toggleQuickActionStatus(
  actions: QuickAction[],
  id: string,
  onPersist: (actions: QuickAction[]) => Promise<boolean>
) {
  await onPersist(
    actions.map((action) => (action.id === id ? { ...action, status: !action.status } : action))
  );
}

export async function reorderAndSaveQuickActions(props: {
  actions: QuickAction[];
  draggedId: string | null;
  onPersist: (actions: QuickAction[]) => Promise<boolean>;
  setDraggedId: (value: string | null) => void;
  setDragOverId: (value: string | null) => void;
  targetId: string;
}) {
  if (!props.draggedId || props.draggedId === props.targetId) {
    props.setDraggedId(null);
    props.setDragOverId(null);
    return;
  }

  const nextActions = reorderQuickActions(props.actions, props.draggedId, props.targetId);

  if (!nextActions) {
    props.setDraggedId(null);
    props.setDragOverId(null);
    return;
  }

  await props.onPersist(nextActions);
  props.setDraggedId(null);
  props.setDragOverId(null);
}
