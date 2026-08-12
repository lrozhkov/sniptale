import { useEffect } from 'react';
import type {
  VideoEditorProjectHistoryActions,
  VideoEditorProjectHistoryStatus,
} from '../../contracts/commands/history';
import { isEditableTarget } from '../app-model/utils';

interface VideoEditorProjectHistoryShortcutParams {
  enabled: boolean;
  status: VideoEditorProjectHistoryStatus;
  undo: VideoEditorProjectHistoryActions['undoProject'];
  redo: VideoEditorProjectHistoryActions['redoProject'];
}

function resolveHistoryShortcut(event: KeyboardEvent): 'undo' | 'redo' | null {
  const primaryModifier = event.ctrlKey !== event.metaKey && (event.ctrlKey || event.metaKey);
  if (!primaryModifier || event.altKey) return null;
  if (event.code === 'KeyZ') return event.shiftKey ? 'redo' : 'undo';
  if (event.code === 'KeyY' && !event.shiftKey) return 'redo';
  return null;
}

export function useVideoEditorProjectHistoryShortcuts(
  params: VideoEditorProjectHistoryShortcutParams
): void {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!params.enabled || isEditableTarget(event.target)) return;
      const command = resolveHistoryShortcut(event);
      if (!command || !params.status[command === 'undo' ? 'canUndo' : 'canRedo']) return;
      event.preventDefault();
      if (command === 'undo') params.undo();
      else params.redo();
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [params]);
}
