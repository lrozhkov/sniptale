import type { BlurSettings } from '../../../../../features/highlighter/contracts';

import type { SourceState } from '../../../../document/model/source-state';
import { applyBlurBorderMetadata } from '../border';
import type { BlurRuntimeObject } from '../types';

export function applyBlurMetadata(object: BlurRuntimeObject, settings: BlurSettings): void {
  object.sniptaleBlurAmount = settings.amount;
  object.sniptaleBlurType = settings.blurType;
  object.sniptaleBlurShowBorder = settings.showBorder ?? (settings.strokeWidth ?? 0) > 0;
  applyBlurBorderMetadata(object, settings);
}

export function applyBlurSourceMetadata(object: BlurRuntimeObject, source: SourceState): void {
  object.sniptaleBlurSourceData = source.dataUrl;
  object.sniptaleBlurSourceLeft = source.left;
  object.sniptaleBlurSourceTop = source.top;
  object.sniptaleBlurSourceWidth = source.displayWidth;
  object.sniptaleBlurSourceHeight = source.displayHeight;
}
