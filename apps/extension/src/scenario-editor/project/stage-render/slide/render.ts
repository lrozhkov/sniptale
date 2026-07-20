import type { ScenarioSlide } from '@sniptale/runtime-contracts/scenario/types/v3';
import { layoutScenarioSlide } from './layout';
import { renderScenarioSlideSvg } from './svg';
import type { ScenarioSlideRenderOptions, ScenarioSlideRenderResult } from './types';

export function renderScenarioSlide(
  slide: ScenarioSlide,
  options: ScenarioSlideRenderOptions
): ScenarioSlideRenderResult {
  const layout = layoutScenarioSlide(slide, options);
  const selectionBoxes =
    options.mode === 'editor'
      ? layout.elements.filter((element) => element.selected).map((element) => element.box)
      : [];
  const resultWithoutSvg = {
    canvas: {
      ...layout.canvas,
      sourceHeight: slide.canvas.height,
      sourceWidth: slide.canvas.width,
    },
    elements: layout.elements,
    missingAssets: layout.missingAssets,
    selectionBoxes,
    slide,
  };

  return {
    ...resultWithoutSvg,
    svg: renderScenarioSlideSvg(resultWithoutSvg),
  };
}
