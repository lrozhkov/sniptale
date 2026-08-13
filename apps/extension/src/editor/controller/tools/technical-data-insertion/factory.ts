import type { FabricObject } from 'fabric';
import {
  createDrawingId,
  type DrawingTextObject,
  type DrawingToolDefaults,
} from '../../../../features/drawing/public';
import { getCurrentLocale } from '../../../../platform/i18n';
import { createEditorDrawingFabricObject } from '../../../drawing/object/vector';
import { synchronizeEditorDrawingObjectFromFabric } from '../../../drawing/object/metadata';

import type { SourceState } from '../../../document/model/source-state';
import type { EditorTechnicalDataKind, EditorTechnicalDataLayout } from '../technical-data';
import { buildTechnicalDataText } from './content';
import { clampTechnicalDataTextPosition } from './positioning';
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
  const drawing: DrawingTextObject = {
    id: createDrawingId(),
    kind: 'text',
    bounds: {
      x: options.source.left + 20,
      y: options.source.top + 20,
      width: getTechnicalDataTextWidth(technicalDataText, layout, options.textSettings),
      height: 1,
    },
    text: technicalDataText,
    color: options.textSettings.color,
    backgroundColor: options.textSettings.backgroundColor,
    fontFamily: options.textSettings.fontFamily,
    fontSize: options.textSettings.fontSize,
  };
  const text = createEditorDrawingFabricObject(drawing, options.nextLabelIndex);
  clampTechnicalDataTextPosition(text, options.source);
  synchronizeEditorDrawingObjectFromFabric(text);
  options.prepareObject(text);
  return text;
}
