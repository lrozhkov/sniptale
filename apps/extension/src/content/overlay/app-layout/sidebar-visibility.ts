import type { ContentAppLayoutScenarioProps } from './types';

export function shouldRenderContentScenarioRecorderSidebar(args: {
  isCompletelyHidden: boolean;
  isToolbarVisible: boolean;
  scenario: Pick<ContentAppLayoutScenarioProps, 'state'>;
}) {
  return !args.isCompletelyHidden && args.scenario.state.scenarioEnabled;
}
