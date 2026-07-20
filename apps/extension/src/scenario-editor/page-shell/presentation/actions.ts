import type { ScenarioProjectV3 } from '@sniptale/runtime-contracts/scenario/types/v3';
import {
  getScenarioPresentationNextPosition,
  getScenarioPresentationPreviousPosition,
  type ScenarioPresentationPosition,
} from './navigation';

export interface ScenarioPresentationActionController {
  clickIndex: number;
  onClickIndexChange: (clickIndex: number) => void;
  onPositionChange?: (position: ScenarioPresentationPosition) => void;
  project: ScenarioProjectV3;
  selectedSlideId: string;
  selectSlide: (slideId: string) => void;
}

export function advanceScenarioPresentation(controller: ScenarioPresentationActionController) {
  applyScenarioPresentationPosition(
    controller,
    getScenarioPresentationNextPosition(
      controller.project,
      getCurrentPresentationPosition(controller)
    )
  );
}

export function rewindScenarioPresentation(controller: ScenarioPresentationActionController) {
  applyScenarioPresentationPosition(
    controller,
    getScenarioPresentationPreviousPosition(
      controller.project,
      getCurrentPresentationPosition(controller)
    )
  );
}

export function getScenarioPresentationSlideIndex(
  project: ScenarioProjectV3,
  slideId: string
): number {
  return project.slides.findIndex((slide) => slide.id === slideId);
}

function applyScenarioPresentationPosition(
  controller: ScenarioPresentationActionController,
  position: ScenarioPresentationPosition | null
) {
  if (!position) {
    return;
  }

  if (position.slideId !== controller.selectedSlideId) {
    controller.selectSlide(position.slideId);
  }
  controller.onClickIndexChange(position.clickIndex);
  controller.onPositionChange?.(position);
}

function getCurrentPresentationPosition(
  controller: ScenarioPresentationActionController
): ScenarioPresentationPosition {
  return { clickIndex: controller.clickIndex, slideId: controller.selectedSlideId };
}
