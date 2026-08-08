import type { QuickAction } from '../../../../contracts/settings';
import { persistQuickActions } from './crud';
import { reorderQuickActionsBefore } from './section/helpers';

export function createQuickActionsOrdering(props: {
  actions: QuickAction[];
  setActions: (actions: QuickAction[]) => void;
}) {
  return {
    handleMoveBefore: async (actionId: string, beforeActionId: string | null) => {
      const reordered = reorderQuickActionsBefore(props.actions, actionId, beforeActionId);
      if (reordered) await persistQuickActions(reordered, props.setActions);
    },
  };
}
