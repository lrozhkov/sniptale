import type { ScenarioElement, ScenarioSlide } from '@sniptale/runtime-contracts/scenario/types/v3';
import { SCENARIO_V3_ELEMENT_KINDS } from '@sniptale/runtime-contracts/scenario/types/v3';
import { computeImageContentBox, resolveSlideImageAsset } from './assets';
import { isScenarioElementVisibleAtClick, resolveScenarioSlideClickIndex } from './build';
import { createRenderBox, scaleFrame } from './coordinates';
import type {
  ScenarioMissingSlideAsset,
  ScenarioRenderedElement,
  ScenarioSlideRenderOptions,
} from './types';

function getRenderScale(slide: ScenarioSlide, options: ScenarioSlideRenderOptions): number {
  const widthScale = options.outputWidth ? options.outputWidth / slide.canvas.width : 1;
  const heightScale = options.outputHeight ? options.outputHeight / slide.canvas.height : 1;

  return Math.min(widthScale, heightScale);
}

function createRenderedElement(
  element: ScenarioElement,
  options: ScenarioSlideRenderOptions,
  scale: number
): ScenarioRenderedElement {
  const selected = options.mode === 'editor' && !!options.selectedElementIds?.includes(element.id);
  const box = createRenderBox(element.frame, scale);

  if (element.kind !== SCENARIO_V3_ELEMENT_KINDS.image) {
    return { box, element, kind: element.kind, selected } as ScenarioRenderedElement;
  }

  const asset = resolveSlideImageAsset(element, options.assets);
  const contentBox = scaleFrame(computeImageContentBox(element.frame, element, asset), scale);
  return {
    asset,
    box,
    contentBox,
    element,
    kind: element.kind,
    ...(options.missingAssetLabel === undefined
      ? {}
      : { missingAssetLabel: options.missingAssetLabel }),
    selected,
  };
}

export function layoutScenarioSlide(
  slide: ScenarioSlide,
  options: ScenarioSlideRenderOptions
): {
  canvas: { backgroundColor: string; height: number; scale: number; width: number };
  elements: ScenarioRenderedElement[];
  missingAssets: ScenarioMissingSlideAsset[];
} {
  const scale = getRenderScale(slide, options);
  const clickIndex = resolveScenarioSlideClickIndex(slide, options.clickIndex);
  const elements = slide.elements
    .filter((element) => isScenarioElementVisibleAtClick(element, clickIndex))
    .map((element) => createRenderedElement(element, options, scale));
  const missingAssets = elements.flatMap((rendered) =>
    rendered.kind === SCENARIO_V3_ELEMENT_KINDS.image && !rendered.asset
      ? [{ assetId: rendered.element.assetRef.assetId, elementId: rendered.element.id }]
      : []
  );

  return {
    canvas: {
      backgroundColor:
        slide.canvas.background.kind === 'solid' ? slide.canvas.background.color : '#f3ede2',
      height: slide.canvas.height * scale,
      scale,
      width: slide.canvas.width * scale,
    },
    elements,
    missingAssets,
  };
}
