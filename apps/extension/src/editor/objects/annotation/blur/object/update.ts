import type { FabricObject } from 'fabric';
import type { BlurSettings } from '../../../../../features/highlighter/contracts';

import type { SourceState } from '../../../../document/model/source-state';
import { attachBlurRenderer, refreshBlurImage } from '../../blur-rendering';
import { applyBlurBorderStyle } from '../border';
import {
  expandBlurAreaBounds,
  normalizeBlurBounds,
  resolveBlurAreaBounds,
  type BlurRectBounds,
} from '../geometry';
import { isBlurObject } from './identity';
import { applyBlurMetadata, applyBlurSourceMetadata } from './metadata';
import { getBlurSettings } from './settings';

export function updateBlurObject(
  object: FabricObject,
  options: {
    bounds?: BlurRectBounds;
    settings?: BlurSettings;
    source?: SourceState;
  } = {}
): void {
  if (!isBlurObject(object)) {
    return;
  }

  const previousSettings = getBlurSettings(object);
  const settings = options.settings ?? previousSettings;
  const areaBounds = options.bounds
    ? normalizeBlurBounds(options.bounds)
    : resolveBlurAreaBounds(object);
  object.set(expandBlurAreaBounds(areaBounds));
  applyBlurMetadata(object, settings);
  if (options.source) {
    applyBlurSourceMetadata(object, options.source);
  }
  applyBlurBorderStyle(object, settings);
  attachBlurRenderer(object, getBlurSettings);
  refreshBlurImage(object, settings);
}
