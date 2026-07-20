import { describe, expect, it, vi } from 'vitest';
import {
  createScenarioProjectV3,
  createScenarioSlide,
} from '../../../features/scenario/project/v3';
import {
  advanceScenarioPresentation,
  getScenarioPresentationSlideIndex,
  rewindScenarioPresentation,
  type ScenarioPresentationActionController,
} from './actions';

describe('scenario presentation actions', () => {
  it('applies click advances and publishes synchronized positions', () => {
    const controller = createController({ clickIndex: 0 });

    advanceScenarioPresentation(controller);

    expect(controller.onClickIndexChange).toHaveBeenCalledWith(1);
    expect(controller.onPositionChange).toHaveBeenCalledWith({ clickIndex: 1, slideId: 'slide-1' });
    expect(controller.selectSlide).not.toHaveBeenCalled();
  });

  it('moves across slide boundaries and ignores unavailable positions', () => {
    const controller = createController({ clickIndex: 2 });

    advanceScenarioPresentation(controller);
    rewindScenarioPresentation({ ...controller, clickIndex: 0, selectedSlideId: 'slide-1' });

    expect(controller.selectSlide).toHaveBeenCalledWith('slide-2');
    expect(controller.onPositionChange).toHaveBeenCalledWith({ clickIndex: 0, slideId: 'slide-2' });
    expect(controller.onPositionChange).toHaveBeenCalledTimes(1);
  });

  it('resolves the selected slide index from the project', () => {
    const project = createProject();

    expect(getScenarioPresentationSlideIndex(project, 'slide-2')).toBe(1);
    expect(getScenarioPresentationSlideIndex(project, 'missing')).toBe(-1);
  });
});

function createController(
  patch: Partial<ScenarioPresentationActionController> = {}
): ScenarioPresentationActionController {
  return {
    clickIndex: 0,
    onClickIndexChange: vi.fn(),
    onPositionChange: vi.fn(),
    project: createProject(),
    selectedSlideId: 'slide-1',
    selectSlide: vi.fn(),
    ...patch,
  };
}

function createProject() {
  const project = createScenarioProjectV3('Deck');
  return {
    ...project,
    slides: [
      createScenarioSlide({
        clicks: { count: 2, initialIndex: 0 },
        id: 'slide-1',
        title: 'First',
      }),
      createScenarioSlide({
        clicks: { count: 1, initialIndex: 0 },
        id: 'slide-2',
        title: 'Second',
      }),
    ],
  };
}
