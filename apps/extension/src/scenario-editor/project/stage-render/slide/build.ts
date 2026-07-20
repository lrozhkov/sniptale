import type { ScenarioElement, ScenarioSlide } from '@sniptale/runtime-contracts/scenario/types/v3';

export interface ScenarioSlideBuildStepSummary {
  clickIndex: number;
  enteringElementIds: string[];
  exitingElementIds: string[];
  hiddenElementIds: string[];
  visibleElementIds: string[];
}

export function clampScenarioSlideClickIndex(slide: ScenarioSlide, clickIndex: number): number {
  const maxClick = Math.max(0, slide.clicks.count);
  return Math.min(maxClick, Math.max(0, Math.trunc(clickIndex)));
}

export function resolveScenarioSlideClickIndex(
  slide: ScenarioSlide,
  clickIndex: number | undefined
): number {
  return clampScenarioSlideClickIndex(slide, clickIndex ?? slide.clicks.initialIndex);
}

export function isScenarioElementVisibleAtClick(
  element: ScenarioElement,
  clickIndex: number
): boolean {
  if (!element.visible) {
    return false;
  }

  if (clickIndex < element.build.showAtClick) {
    return false;
  }

  return element.build.hideAtClick === null || clickIndex < element.build.hideAtClick;
}

export function getScenarioSlideBuildStepSummaries(
  slide: ScenarioSlide
): ScenarioSlideBuildStepSummary[] {
  const clickCount = clampScenarioSlideClickIndex(slide, slide.clicks.count);

  return Array.from({ length: clickCount + 1 }, (_, clickIndex) =>
    getScenarioSlideBuildStepSummary(slide, clickIndex)
  );
}

export function getScenarioSlideBuildStepSummary(
  slide: ScenarioSlide,
  clickIndex: number
): ScenarioSlideBuildStepSummary {
  const resolvedClickIndex = resolveScenarioSlideClickIndex(slide, clickIndex);
  const orderedElements = [...slide.elements].sort(compareScenarioElementsByBuildOrder);

  return {
    clickIndex: resolvedClickIndex,
    enteringElementIds: orderedElements
      .filter((element) => element.build.showAtClick === resolvedClickIndex)
      .map((element) => element.id),
    exitingElementIds: orderedElements
      .filter((element) => element.build.hideAtClick === resolvedClickIndex)
      .map((element) => element.id),
    hiddenElementIds: orderedElements
      .filter((element) => !isScenarioElementVisibleAtClick(element, resolvedClickIndex))
      .map((element) => element.id),
    visibleElementIds: orderedElements
      .filter((element) => isScenarioElementVisibleAtClick(element, resolvedClickIndex))
      .map((element) => element.id),
  };
}

function compareScenarioElementsByBuildOrder(
  first: ScenarioElement,
  second: ScenarioElement
): number {
  const orderDelta = first.build.order - second.build.order;
  return orderDelta === 0 ? first.createdAt - second.createdAt : orderDelta;
}
