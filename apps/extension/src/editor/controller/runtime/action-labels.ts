import type { Canvas } from 'fabric';
import type { EditorObjectType } from '../../../features/editor/document/types';

export function getNextEditorLabelIndex(canvas: Canvas | null, type: EditorObjectType): number {
  return (canvas?.getObjects().filter((object) => object.sniptaleType === type).length ?? 0) + 1;
}
