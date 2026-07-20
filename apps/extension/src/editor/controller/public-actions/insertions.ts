import type { Canvas, FabricObject } from 'fabric';
import { useEditorStore } from '../../state/useEditorStore';

import type { SourceState } from '../../document/model/source-state';
import { createInsertedImageObject, createTechnicalDataTextObject } from '../tools/insertions';
import type { EditorTechnicalDataKind, EditorTechnicalDataLayout } from '../tools/technical-data';

export async function insertEditorImageObject(options: {
  canvas: Canvas | null;
  source: SourceState | null;
  dataUrl: string;
  name: string | null;
  prepareObject: (object: FabricObject) => void;
  nextLabelIndex: (type: 'image') => number;
  commitHistory: () => void;
  syncRuntimeState: () => void;
}): Promise<void> {
  const {
    canvas,
    source,
    dataUrl,
    name,
    prepareObject,
    nextLabelIndex,
    commitHistory,
    syncRuntimeState,
  } = options;
  if (!canvas || !source) {
    return;
  }

  const image = await createInsertedImageObject({
    dataUrl,
    name,
    source,
    canvasWidth: canvas.getWidth(),
    canvasHeight: canvas.getHeight(),
    nextLabelIndex: nextLabelIndex('image'),
    prepareObject,
  });
  canvas.add(image);
  canvas.setActiveObject(image);
  canvas.requestRenderAll();
  commitHistory();
  syncRuntimeState();
}

export function insertEditorTechnicalDataObject(options: {
  canvas: Canvas | null;
  source: SourceState | null;
  kinds: readonly EditorTechnicalDataKind[];
  layout?: EditorTechnicalDataLayout;
  prepareObject: (object: FabricObject) => void;
  nextLabelIndex: (type: 'text') => number;
  commitHistory: () => void;
  syncRuntimeState: () => void;
}): void {
  const {
    canvas,
    source,
    kinds,
    layout,
    prepareObject,
    nextLabelIndex,
    commitHistory,
    syncRuntimeState,
  } = options;
  if (!canvas || !source || kinds.length === 0) {
    return;
  }

  const store = useEditorStore.getState();
  const text = createTechnicalDataTextObject({
    kinds,
    ...(layout === undefined ? {} : { layout }),
    source,
    sourceUrl: store.browserFrame.url.trim(),
    sourceTitle: store.pageTitle.trim(),
    nextLabelIndex: nextLabelIndex('text'),
    textSettings: store.toolSettings.text,
    prepareObject,
  });
  canvas.add(text);
  canvas.setActiveObject(text);
  canvas.requestRenderAll();
  commitHistory();
  store.setInspector('tool');
  syncRuntimeState();
}
