import type { BaseBrush, Canvas } from 'fabric';
import type { EditorBrushSettings } from '../../../../features/editor/document/types';
import { applyLiveFreehandBrushSettings } from '../brush-config';
import { EditorFreehandBrush } from './instance';

function resolveBrushInstance(
  canvas: Canvas,
  brush: BaseBrush | null | undefined
): EditorFreehandBrush {
  return brush instanceof EditorFreehandBrush ? brush : new EditorFreehandBrush(canvas);
}

export function configureLiveFreehandBrush(
  canvas: Canvas,
  settings: EditorBrushSettings,
  brush: BaseBrush | null | undefined
): EditorFreehandBrush {
  const nextBrush = resolveBrushInstance(canvas, brush);
  applyLiveFreehandBrushSettings(nextBrush, settings);
  return nextBrush;
}
