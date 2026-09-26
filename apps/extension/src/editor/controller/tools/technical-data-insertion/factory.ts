import { Textbox, type FabricObject } from 'fabric';
import {
  createDrawingId,
  DRAWING_TEXT_VERTICAL_PADDING,
  type DrawingTextObject,
  type DrawingToolDefaults,
} from '../../../../features/drawing/public';
import { getCurrentLocale } from '../../../../platform/i18n';
import { createEditorDrawingFabricObject } from '../../../drawing/object/vector';
import { synchronizeEditorDrawingObjectFromFabric } from '../../../drawing/object/metadata';

import type { SourceState } from '../../../document/model/source-state';
import type { EditorTechnicalDataKind, EditorTechnicalDataLayout } from '../technical-data';
import { buildTechnicalDataText } from './content';
import { clampTechnicalDataTextPosition, getTechnicalDataTextInset } from './positioning';
import { getTechnicalDataTextWidth } from './sizing';

export function createTechnicalDataTextObject(options: {
  kinds: readonly EditorTechnicalDataKind[];
  source: SourceState;
  sourceUrl: string;
  sourceTitle: string;
  nextLabelIndex: number;
  layout?: EditorTechnicalDataLayout;
  textSettings: DrawingToolDefaults['text'];
  prepareObject: (object: FabricObject) => void;
}): FabricObject {
  const locale = getCurrentLocale();
  const layout = options.layout ?? 'column';
  const technicalDataText = buildTechnicalDataText({
    kinds: options.kinds,
    layout,
    locale,
    sourceTitle: options.sourceTitle,
    sourceUrl: options.sourceUrl,
  });
  const inset = getTechnicalDataTextInset(options.source);
  const availableWidth = Math.max(1, options.source.displayWidth - inset * 2);
  const availableHeight = Math.max(1, options.source.displayHeight - inset * 2);
  let drawing: DrawingTextObject = {
    id: createDrawingId(),
    kind: 'text',
    bounds: {
      x: options.source.left + inset,
      y: options.source.top + inset,
      width: Math.min(
        getTechnicalDataTextWidth(technicalDataText, layout, options.textSettings),
        availableWidth
      ),
      height: 1,
    },
    text: technicalDataText,
    color: options.textSettings.color,
    backgroundColor: options.textSettings.backgroundColor,
    fontFamily: options.textSettings.fontFamily,
    fontSize: options.textSettings.fontSize,
  };
  let text = createEditorDrawingFabricObject(drawing, options.nextLabelIndex);
  for (let attempt = 0; attempt < 8; attempt += 1) {
    if (text instanceof Textbox) {
      text.set({
        height: Math.max(text.height, text.calcTextHeight() + DRAWING_TEXT_VERTICAL_PADDING * 2),
      });
    }
    const width = text.getScaledWidth();
    const height = text.getScaledHeight();
    if (width <= availableWidth && height <= availableHeight) break;
    const fit = Math.min(availableWidth / width, availableHeight / height) * 0.98;
    drawing = { ...drawing, fontSize: drawing.fontSize * fit };
    text = createEditorDrawingFabricObject(drawing, options.nextLabelIndex);
  }
  clampTechnicalDataTextPosition(text, options.source);
  text.setCoords();
  synchronizeEditorDrawingObjectFromFabric(text);
  options.prepareObject(text);
  return text;
}
