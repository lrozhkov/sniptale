import { clampScenarioSlideClickIndex } from '../../project/stage-render/slide';
import type {
  ScenarioProjectV3,
  ScenarioSlide,
} from '@sniptale/runtime-contracts/scenario/types/v3';

export interface ScenarioPresentationPosition {
  clickIndex: number;
  slideId: string;
}

export function getScenarioPresentationNextPosition(
  project: ScenarioProjectV3,
  position: ScenarioPresentationPosition
): ScenarioPresentationPosition | null {
  const slide = findPositionSlide(project, position);
  if (!slide) {
    return null;
  }

  const clickIndex = clampScenarioSlideClickIndex(slide, position.clickIndex);
  if (clickIndex < slide.clicks.count) {
    return { clickIndex: clickIndex + 1, slideId: slide.id };
  }

  return getAdjacentSlidePosition(project, slide.id, 1, getSlideInitialClickIndex);
}

export function getScenarioPresentationPreviousPosition(
  project: ScenarioProjectV3,
  position: ScenarioPresentationPosition
): ScenarioPresentationPosition | null {
  const slide = findPositionSlide(project, position);
  if (!slide) {
    return null;
  }

  const clickIndex = clampScenarioSlideClickIndex(slide, position.clickIndex);
  if (clickIndex > 0) {
    return { clickIndex: clickIndex - 1, slideId: slide.id };
  }

  return getAdjacentSlidePosition(project, slide.id, -1, getSlideLastClickIndex);
}

function getAdjacentSlidePosition(
  project: ScenarioProjectV3,
  slideId: string,
  offset: number,
  getClickIndex: (slide: ScenarioSlide) => number
): ScenarioPresentationPosition | null {
  const currentIndex = project.slides.findIndex((slide) => slide.id === slideId);
  const slide = project.slides[currentIndex + offset];
  return slide ? { clickIndex: getClickIndex(slide), slideId: slide.id } : null;
}

function findPositionSlide(
  project: ScenarioProjectV3,
  position: ScenarioPresentationPosition
): ScenarioSlide | null {
  return project.slides.find((slide) => slide.id === position.slideId) ?? null;
}

function getSlideInitialClickIndex(slide: ScenarioSlide): number {
  return clampScenarioSlideClickIndex(slide, slide.clicks.initialIndex);
}

function getSlideLastClickIndex(slide: ScenarioSlide): number {
  return clampScenarioSlideClickIndex(slide, slide.clicks.count);
}
