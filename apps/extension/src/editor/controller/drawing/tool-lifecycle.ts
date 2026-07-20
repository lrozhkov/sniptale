import {
  createCanvasToolDragPredicate,
  resolveCanvasToolLifecycleCommit,
  type CanvasToolLifecycleCommit,
} from '@sniptale/runtime-contracts/canvas-interactions';
import type { DrawSession } from '../core/types';

const shouldCommitEditorDrawSessionDrag = createCanvasToolDragPredicate<DrawSession['tool']>({
  connectorKinds: ['arrow', 'line'],
});

export function resolveEditorDrawSessionLifecycleCommit(
  drawSession: DrawSession,
  minDrawSize: number
): CanvasToolLifecycleCommit<DrawSession['tool']> | null {
  if (!drawSession.start) {
    return null;
  }

  const current = drawSession.lastPoint ?? drawSession.start;
  return resolveCanvasToolLifecycleCommit({
    minDragSize: minDrawSize,
    session: {
      current: { x: current.x, y: current.y },
      kind: drawSession.tool,
      origin: { x: drawSession.start.x, y: drawSession.start.y },
      pointerId: 0,
    },
    shouldCommitDrag: shouldCommitEditorDrawSessionDrag,
  });
}

export function isEditorDrawSessionLifecycleClick(
  drawSession: DrawSession,
  minDrawSize: number
): boolean | null {
  return resolveEditorDrawSessionLifecycleCommit(drawSession, minDrawSize)?.commitKind === 'click';
}
