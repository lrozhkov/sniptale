import { useState } from 'react';

import type { AiProvidersDeleteState } from '../types';

type DeleteStateController = {
  confirmDelete: AiProvidersDeleteState;
  setConfirmDelete: (value: AiProvidersDeleteState) => void;
};

export function useDeleteState(): DeleteStateController {
  const [confirmDelete, setConfirmDelete] = useState<AiProvidersDeleteState>(null);

  return {
    confirmDelete,
    setConfirmDelete,
  };
}
