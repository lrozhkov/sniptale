import { useState } from 'react';

import type { PromptTemplate } from '../../../contracts/settings';

export interface ConfirmState {
  isOpen: boolean;
  template: PromptTemplate | null;
}

export function useTemplateDeleteState() {
  const [confirmState, setConfirmState] = useState<ConfirmState>({ isOpen: false, template: null });

  return {
    closeDeleteDialog: () => setConfirmState({ isOpen: false, template: null }),
    confirmState,
    openDeleteDialog: (template: PromptTemplate) => setConfirmState({ isOpen: true, template }),
  };
}
