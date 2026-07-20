import {
  createScenarioProjectV3,
  createScenarioSlide,
  createScenarioTextElement,
} from '../../features/scenario/project/v3';
import type { ScenarioProjectV3 } from '@sniptale/runtime-contracts/scenario/types/v3';

export function createCommandsProject(): ScenarioProjectV3 {
  const project = createScenarioProjectV3('Commands');
  return {
    ...project,
    id: 'project-1',
    slides: [
      {
        ...project.slides[0]!,
        elements: [{ ...createScenarioTextElement({ text: 'Title' }), id: 'text-1' }],
        id: 'slide-1',
      },
    ],
  };
}

export function createCommandsTwoSlideProject(): ScenarioProjectV3 {
  const project = createCommandsProject();
  const secondElement = { ...createScenarioTextElement({ text: 'Second' }), id: 'text-2' };
  return {
    ...project,
    slides: [
      project.slides[0]!,
      {
        ...createScenarioSlide({ title: 'Second' }),
        elements: [secondElement],
        id: 'slide-2',
      },
    ],
  };
}
