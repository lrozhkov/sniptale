import type { FabricObject } from 'fabric';
import type { EditorObjectType } from '../../../../features/editor/document/types';
import { readEditorDrawingObject } from '../../../drawing/object/metadata';
import { useEditorStore } from '../../../state/useEditorStore';
import { syncRichShapeSelectionSettings } from '../rich-shape-sync';
import { syncImageSelectionSettings } from '../sync-image';
import { syncStepSelectionSettings } from '../sync-step';

function syncDrawingSelection(object: FabricObject): void {
  const drawing = readEditorDrawingObject(object);
  if (!drawing || drawing.kind === 'blur') return;
  const store = useEditorStore.getState();
  if (drawing.kind === 'pencil') {
    store.updateSelectionDrawingToolSettings('pencil', {
      color: drawing.color,
      width: drawing.width,
    });
  } else if (drawing.kind === 'marker') {
    store.updateSelectionDrawingToolSettings('marker', {
      color: drawing.color,
      opacity: drawing.opacity,
      width: drawing.width,
    });
  } else if (drawing.kind === 'arrow') {
    store.updateSelectionDrawingToolSettings('arrow', {
      color: drawing.color,
      design: drawing.design ?? 'standard',
      dynamicWidth: drawing.dynamicWidth,
      width: drawing.width,
    });
  } else if (drawing.kind === 'text') {
    store.updateSelectionDrawingToolSettings('text', {
      backgroundColor: drawing.backgroundColor,
      color: drawing.color,
      fontFamily: drawing.fontFamily ?? 'handwritten',
      fontSize: drawing.fontSize,
    });
  } else {
    store.updateSelectionDrawingToolSettings('shape', {
      color: drawing.color,
      fillColor: drawing.fillColor ?? null,
      kind: drawing.kind === 'parallelogram' ? 'rectangle' : drawing.kind,
      width: drawing.width,
    });
  }
}

export function syncSelectionToolSettingsFromObject(
  object: FabricObject,
  type: EditorObjectType
): void {
  switch (type) {
    case 'transparent-base':
    case 'browser-frame':
    case 'frame-annotation':
      break;
    case 'source-image':
    case 'background':
    case 'image':
      syncImageSelectionSettings(object);
      break;
    case 'pencil':
    case 'marker':
    case 'shape':
    case 'blur':
    case 'text':
    case 'arrow':
      syncDrawingSelection(object);
      break;
    case 'meta-stamp':
      break;
    case 'step':
      syncStepSelectionSettings(object);
      break;
    case 'rich-shape':
      syncRichShapeSelectionSettings(object);
      break;
  }
}
