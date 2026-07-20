import { useQuickActionsController } from '../controller';

export type QuickActionsSectionState = ReturnType<typeof useQuickActionsController>;

export function useQuickActionsSection(): QuickActionsSectionState {
  return useQuickActionsController();
}
