import type { QuickAction } from '../../../../../contracts/settings';

export async function toggleQuickActionStatus(
  actions: QuickAction[],
  id: string,
  onPersist: (actions: QuickAction[]) => Promise<boolean>
) {
  await onPersist(
    actions.map((action) => (action.id === id ? { ...action, status: !action.status } : action))
  );
}
