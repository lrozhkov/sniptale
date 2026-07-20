import type { FabricObject } from 'fabric';
import type { EditorWorkspaceSettings } from '../../../features/editor/document/types';
import { isSourceObject, isUserObject } from '../../document/model';

export function applyEditorGridSnap(
  object: FabricObject,
  workspace: EditorWorkspaceSettings
): void {
  if (
    !workspace.gridEnabled ||
    !workspace.gridSnapEnabled ||
    !isUserObject(object) ||
    isSourceObject(object)
  ) {
    return;
  }

  const gridSize = Math.max(1, workspace.gridSize);
  const nextLeft = object.left == null ? null : Math.round(object.left / gridSize) * gridSize;
  const nextTop = object.top == null ? null : Math.round(object.top / gridSize) * gridSize;

  if (nextLeft !== null) {
    object.set('left', nextLeft);
  }
  if (nextTop !== null) {
    object.set('top', nextTop);
  }
  if (nextLeft !== null || nextTop !== null) {
    object.setCoords();
  }
}
