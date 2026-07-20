import { createScenarioProjectV3 } from '../../../features/scenario/project/v3';
import type { ScenarioProjectV3 } from '@sniptale/runtime-contracts/scenario/types/v3';
import { SCENARIO_VISUAL_BASELINE_PROJECT_ID, SCENARIO_VISUAL_BASELINE_TIME } from './constants';
import { createScenarioVisualBaselineSlides } from './slides';

export {
  SCENARIO_VISUAL_BASELINE_PROJECT_ID,
  SCENARIO_VISUAL_BASELINE_SLIDE_IDS,
} from './constants';
export { createScenarioVisualBaselineAssets } from './assets';

export function createScenarioVisualBaselineProject(): ScenarioProjectV3 {
  return {
    ...createScenarioProjectV3('Scenario Editor visual baseline'),
    createdAt: SCENARIO_VISUAL_BASELINE_TIME,
    id: SCENARIO_VISUAL_BASELINE_PROJECT_ID,
    slides: createScenarioVisualBaselineSlides(),
    updatedAt: SCENARIO_VISUAL_BASELINE_TIME,
  };
}
