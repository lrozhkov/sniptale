import { Rect } from 'fabric';
import type { BlurSettings } from '../../../../../features/highlighter/contracts';

import type { SourceState } from '../../../../document/model/source-state';
import { createObjectLabel } from '../../../../document/model';
import { normalizeBlurBounds } from '../geometry';
import type { BlurRuntimeObject } from '../types';
import { updateBlurObject } from './update';

export function createBlurObject(args: {
  height: number;
  id: string;
  labelIndex: number;
  left: number;
  settings: BlurSettings;
  source: SourceState;
  top: number;
  width: number;
}): Rect {
  const bounds = normalizeBlurBounds(args);
  const object = new Rect({
    height: bounds.height,
    left: bounds.left,
    originX: 'left',
    originY: 'top',
    top: bounds.top,
    width: bounds.width,
  }) as BlurRuntimeObject;

  object.sniptaleId = args.id;
  object.sniptaleType = 'blur';
  object.sniptaleRole = 'annotation';
  object.sniptaleLabel = createObjectLabel('blur', args.labelIndex);
  updateBlurObject(object, {
    settings: args.settings,
    source: args.source,
  });
  return object;
}
