import type { ContentAppLayoutScenarioProps } from './types';

export function shouldRenderContentScenarioRecorderSidebar(args: {
  isCompletelyHidden: boolean;
  scenario: Pick<ContentAppLayoutScenarioProps, 'state'>;
}) {
  return (
    !args.isCompletelyHidden &&
    args.scenario.state.scenarioEnabled &&
    args.scenario.state.sidebarVisible
  );
}
