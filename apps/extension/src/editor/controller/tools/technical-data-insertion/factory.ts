import type { FabricObject } from 'fabric';
import type { EditorTextSettings } from '../../../../features/editor/document/types';
import { getCurrentLocale } from '../../../../platform/i18n';

import { createTextObject } from '../../../objects/annotation/text';

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
  textSettings: EditorTextSettings;
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
  const text = createTextObject({
    id: crypto.randomUUID(),
    labelIndex: options.nextLabelIndex,
    left: options.source.left + 20,
    top: options.source.top + 20,
    settings: { ...options.textSettings, calloutFormat: 'plain' },
    text: technicalDataText,
  });
  resizeTechnicalDataTextObject(text, technicalDataText, layout, options.textSettings);
  clampTechnicalDataTextPosition(text, options.source);
  options.prepareObject(text);
  return text;
}
