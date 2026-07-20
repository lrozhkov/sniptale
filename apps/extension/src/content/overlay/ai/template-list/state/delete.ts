import { useState } from 'react';
import type { PromptTemplate } from '../../../../../contracts/settings';
import type { ConfirmState, TemplateListProps } from '../types';

export function useTemplateDeleteActions() {
  const [confirmState, setConfirmState] = useState<ConfirmState>({
    isOpen: false,
    template: null,
  });

  const handleDeleteTemplate = (
    template: PromptTemplate,
    setOpenMenuId: (id: string | null) => void
  ) => {
    setOpenMenuId(null);
    setConfirmState({ isOpen: true, template });
  };

  const confirmDelete = async (onDeleteTemplate: TemplateListProps['onDeleteTemplate']) => {
    if (!confirmState.template) {
      return;
    }

    await onDeleteTemplate(confirmState.template);
    setConfirmState({ isOpen: false, template: null });
  };

  const cancelDelete = () => {
    setConfirmState({ isOpen: false, template: null });
  };

  return { cancelDelete, confirmDelete, confirmState, handleDeleteTemplate };
}
