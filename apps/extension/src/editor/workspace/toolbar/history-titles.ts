import { translate } from '../../../platform/i18n';

type ToolbarHistoryAction = 'redo' | 'undo';

const HISTORY_TITLE_KEYS = {
  redo: 'editor.toolbar.redo',
  undo: 'editor.toolbar.undo',
} as const;

const HISTORY_UNAVAILABLE_REASON_KEYS = {
  redo: 'editor.toolbar.redoUnavailableReason',
  undo: 'editor.toolbar.undoUnavailableReason',
} as const;

function getHistoryButtonTitle(action: ToolbarHistoryAction, available: boolean): string {
  const label = translate(HISTORY_TITLE_KEYS[action]);
  return available ? label : `${label} · ${translate(HISTORY_UNAVAILABLE_REASON_KEYS[action])}`;
}

export function getUndoButtonTitle(canUndo: boolean): string {
  return getHistoryButtonTitle('undo', canUndo);
}

export function getRedoButtonTitle(canRedo: boolean): string {
  return getHistoryButtonTitle('redo', canRedo);
}
