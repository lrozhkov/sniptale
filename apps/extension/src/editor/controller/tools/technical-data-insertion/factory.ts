import type { FabricObject } from 'fabric';
import type { DrawingToolDefaults } from '../../../../features/drawing/public';
import { getCurrentLocale } from '../../../../platform/i18n';

import { createMetaStamp } from '../../../objects/meta-stamp/factory';

import type { SourceState } from '../../../document/model/source-state';
import type { EditorTechnicalDataKind, EditorTechnicalDataLayout } from '../technical-data';
import { buildTechnicalDataText } from './content';
import { clampTechnicalDataTextPosition } from './positioning';
import { resizeTechnicalDataTextObject } from './sizing';

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
  const text = createMetaStamp(
    'browser',
    technicalDataText,
    options.source.left + 20,
    options.source.top + 20,
    options.nextLabelIndex,
    options.textSettings
  );
  resizeTechnicalDataTextObject(text, technicalDataText, layout, options.textSettings);
  clampTechnicalDataTextPosition(text, options.source);
  options.prepareObject(text);
  return text;
}
