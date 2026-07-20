import { isEditorRasterTargetActionableStatus } from '../../../state/raster-tools';
import { useEditorStore } from '../../../state/useEditorStore';
import type { EditorRasterSelectionMask } from '../../raster/types';
import { resolveRasterOverlayObject } from '../../raster/object';
import { resolveRasterTargetState } from '../../raster/target';
import type { EditorRasterToolSessionState } from '../types';
import { notifyEditorRasterOverlay } from './overlay';
import { syncEditorRasterSelectionSummary } from './selection-summary';
import { clearEditorRasterTransientState, isEditorRasterSessionBoundToTarget } from './transient';

export function clearEditorRasterSelection(session: EditorRasterToolSessionState): boolean {
  const hadSelection = session.selection !== null;
  const transientChanged = clearEditorRasterTransientState(session);
  const changed = hadSelection || transientChanged;
  session.selection = null;
  syncEditorRasterSelectionSummary(null);
  if (changed) {
    notifyEditorRasterOverlay(session);
  }
  return changed;
}

export function setEditorRasterSelection(
  session: EditorRasterToolSessionState,
  selection: EditorRasterSelectionMask | null
): void {
  session.selection = selection;
  syncEditorRasterSelectionSummary(selection);
  notifyEditorRasterOverlay(session);
}

export function syncEditorRasterSelectionSession(args: {
  canvas: import('fabric').Canvas | null;
  session: EditorRasterToolSessionState;
}): void {
  const targetState = resolveRasterTargetState({ canvas: args.canvas });
  const currentTargetId = targetState.summary.layerId;
  if (!isEditorRasterSessionBoundToTarget(args.session, currentTargetId)) {
    const transientChanged = clearEditorRasterTransientState(args.session);
    if (transientChanged) {
      notifyEditorRasterOverlay(args.session);
    }
  }

  useEditorStore.setState({
    rasterTarget: targetState.summary,
  });

  if (!args.session.selection) {
    syncEditorRasterSelectionSummary(null);
    return;
  }

  if (
    isEditorRasterTargetActionableStatus(targetState.summary.status) &&
    currentTargetId === args.session.selection.reference.objectId &&
    resolveRasterOverlayObject(args.canvas, args.session.selection.reference)
  ) {
    syncEditorRasterSelectionSummary(args.session.selection);
    return;
  }

  clearEditorRasterSelection(args.session);
}
