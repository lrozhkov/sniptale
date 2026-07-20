import type { BlurSettings } from '../../../features/highlighter/contracts';
import { attachBlurRenderer, refreshBlurRendering } from './blur/render';
import type { BlurRuntimeObject } from './blur/types';

export type { BlurRuntimeObject } from './blur/types';

export { attachBlurRenderer };

export function refreshBlurImage(object: BlurRuntimeObject, _settings: BlurSettings): void {
  refreshBlurRendering(object);
}
