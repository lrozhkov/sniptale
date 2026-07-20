import type { ScenarioSlideRenderResult } from '../types';
import { renderScenarioSlideSvgDocument } from './document';

export { createScenarioSlideSvgDataUrl } from './data-url';

export function renderScenarioSlideSvg(result: Omit<ScenarioSlideRenderResult, 'svg'>): string {
  return renderScenarioSlideSvgDocument(result);
}
