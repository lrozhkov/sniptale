import { expect, it } from 'vitest';
import {
  createScenarioProjectV3,
  createScenarioSlide,
} from '../../../features/scenario/project/v3';
import {
  getScenarioPresentationNextPosition,
  getScenarioPresentationPreviousPosition,
} from './navigation';

function createProject() {
  const first = createScenarioSlide({
    clicks: { count: 2, initialIndex: 0 },
    id: 'slide-1',
  });
  const second = createScenarioSlide({
    clicks: { count: 3, initialIndex: 1 },
    id: 'slide-2',
  });

  return { ...createScenarioProjectV3('Deck'), slides: [first, second] };
}

it('advances build steps before moving to the next slide', () => {
  const project = createProject();

  expect(
    getScenarioPresentationNextPosition(project, { clickIndex: 1, slideId: 'slide-1' })
  ).toEqual({ clickIndex: 2, slideId: 'slide-1' });
  expect(
    getScenarioPresentationNextPosition(project, { clickIndex: 2, slideId: 'slide-1' })
  ).toEqual({ clickIndex: 1, slideId: 'slide-2' });
});

it('rewinds build steps before moving to the previous slide', () => {
  const project = createProject();

  expect(
    getScenarioPresentationPreviousPosition(project, { clickIndex: 2, slideId: 'slide-2' })
  ).toEqual({ clickIndex: 1, slideId: 'slide-2' });
  expect(
    getScenarioPresentationPreviousPosition(project, { clickIndex: 0, slideId: 'slide-2' })
  ).toEqual({ clickIndex: 2, slideId: 'slide-1' });
});
