import { useRef, useState } from 'react';
import type { EditorInspectorConfirmDialogState } from '../content/types';

export function useInspectorConfirmDialogState() {
  const resolveRef = useRef<((confirmed: boolean) => void) | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<EditorInspectorConfirmDialogState | null>(
    null
  );

  const closeDialog = (confirmed: boolean) => {
    setConfirmDialog(null);
    const resolve = resolveRef.current;
    resolveRef.current = null;
    resolve?.(confirmed);
  };

  return {
    confirmDialog,
    handleConfirmDialogCancel: () => closeDialog(false),
    handleConfirmDialogConfirm: () => closeDialog(true),
    requestConfirm: (dialog: EditorInspectorConfirmDialogState) =>
      new Promise<boolean>((resolve) => {
        resolveRef.current = resolve;
        setConfirmDialog(dialog);
      }),
  };
}
