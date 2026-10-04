import { useEffect } from 'react';
import { isEditableTarget } from '../app-model/utils';

/** Opens the existing export flow using the familiar video-editor shortcut. */
export function useVideoEditorExportShortcut(params: {
  enabled: boolean;
  openExportDialog: () => void;
}): void {
  const { enabled, openExportDialog } = params;
  useEffect(() => {
    if (!enabled) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.code !== 'KeyM' ||
        event.ctrlKey === event.metaKey ||
        event.altKey ||
        event.shiftKey ||
        isEditableTarget(event.target)
      )
        return;
      event.preventDefault();
      if (!event.repeat) openExportDialog();
    };
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [enabled, openExportDialog]);
}
