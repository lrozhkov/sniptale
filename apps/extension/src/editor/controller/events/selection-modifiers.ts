import { ActiveSelection, type Canvas, type FabricObject, type TPointerEvent } from 'fabric';
import type { EditorTool } from '../../../features/editor/document/types';

type MarqueeMode = 'add' | 'toggle';

export type EditorSelectionModifierGesture = {
  marquee: { mode: MarqueeMode; previous: FabricObject[] } | null;
  previousSelectionKey: Canvas['selectionKey'];
  restoreSelectionKey: boolean;
};

function isPrimaryPointer(event: TPointerEvent): boolean {
  return !('button' in event) || event.button === 0;
}

export function beginEditorSelectionModifierGesture(args: {
  activeTool: EditorTool;
  canvas: Canvas;
  event: TPointerEvent;
  target?: FabricObject;
}): EditorSelectionModifierGesture | null {
  if (args.activeTool !== 'select' || !isPrimaryPointer(args.event)) return null;
  const previousSelectionKey = args.canvas.selectionKey;
  if (!args.target && (args.event.shiftKey || args.event.ctrlKey)) {
    return {
      marquee: {
        mode: args.event.shiftKey ? 'add' : 'toggle',
        previous: args.canvas.getActiveObjects().slice(),
      },
      previousSelectionKey,
      restoreSelectionKey: false,
    };
  }
  if (!args.event.shiftKey || !args.target || !args.canvas.getActiveObject()) return null;
  const alreadySelected =
    args.target === args.canvas.getActiveObject() ||
    args.canvas.getActiveObjects().includes(args.target);
  if (alreadySelected) return null;
  args.canvas.selectionKey = 'shiftKey';
  return { marquee: null, previousSelectionKey, restoreSelectionKey: true };
}

export function finishEditorSelectionModifierMouseDown(
  canvas: Canvas,
  gesture: EditorSelectionModifierGesture | null
): EditorSelectionModifierGesture | null {
  if (!gesture?.restoreSelectionKey) return gesture;
  canvas.selectionKey = gesture.previousSelectionKey;
  return { ...gesture, restoreSelectionKey: false };
}

function resolveMarqueeObjects(
  mode: MarqueeMode,
  previous: FabricObject[],
  current: FabricObject[]
): FabricObject[] {
  if (mode === 'add') return [...new Set([...previous, ...current])];
  const previousSet = new Set(previous);
  const currentSet = new Set(current);
  return [
    ...previous.filter((object) => !currentSet.has(object)),
    ...current.filter((object) => !previousSet.has(object)),
  ];
}

export function finishEditorSelectionModifierGesture(
  canvas: Canvas,
  gesture: EditorSelectionModifierGesture | null
): boolean {
  if (!gesture?.marquee) return false;
  const next = resolveMarqueeObjects(
    gesture.marquee.mode,
    gesture.marquee.previous,
    canvas.getActiveObjects()
  );
  canvas.discardActiveObject();
  if (next.length === 1) canvas.setActiveObject(next[0]!);
  else if (next.length > 1) canvas.setActiveObject(new ActiveSelection(next, { canvas }));
  canvas.requestRenderAll();
  return true;
}
