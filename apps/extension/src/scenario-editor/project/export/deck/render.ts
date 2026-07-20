import { renderScenarioSlide } from '../../stage-render/slide';
import type { ScenarioProjectV3 } from '@sniptale/runtime-contracts/scenario/types/v3';
import type { ScenarioDeckExportAssets, ScenarioDeckRenderedSlide } from './types';

export function renderScenarioDeckSlides(args: {
  assets: ScenarioDeckExportAssets;
  project: ScenarioProjectV3;
}): ScenarioDeckRenderedSlide[] {
  return args.project.slides.map((slide, index) => ({
    index,
    slide,
    svg: renderScenarioSlide(slide, {
      assets: args.assets.renderAssets,
      mode: 'export',
    }).svg,
  }));
}
