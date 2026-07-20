import type { ScenarioElement, ScenarioSlide } from '@sniptale/runtime-contracts/scenario/types/v3';

export function resolveEditModeClickIndex(args: {
  clickIndex: number;
  selectedElement: ScenarioElement | null;
  slide: ScenarioSlide;
}): number {
  if (!args.selectedElement) {
    return clampClickIndex(args.slide, args.slide.clicks.count);
  }
  if (isElementVisibleAtClick(args.selectedElement, args.clickIndex)) {
    return clampClickIndex(args.slide, args.clickIndex);
  }

  return clampClickIndex(args.slide, getVisibleBuildClickIndex(args.selectedElement));
}

function getVisibleBuildClickIndex(element: ScenarioElement): number {
  const showAtClick = element.build.showAtClick;
  const lastVisibleClick =
    element.build.hideAtClick === null ? showAtClick : element.build.hideAtClick - 1;

  return Math.max(showAtClick, lastVisibleClick);
}

function isElementVisibleAtClick(element: ScenarioElement, clickIndex: number): boolean {
  if (clickIndex < element.build.showAtClick) {
    return false;
  }

  return element.build.hideAtClick === null || clickIndex < element.build.hideAtClick;
}

function clampClickIndex(slide: ScenarioSlide, clickIndex: number): number {
  return Math.min(Math.max(0, slide.clicks.count), Math.max(0, Math.trunc(clickIndex)));
}
