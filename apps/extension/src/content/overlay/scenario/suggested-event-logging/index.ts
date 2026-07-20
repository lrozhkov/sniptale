import { useEffect } from 'react';
import { registerScenarioSuggestedEventListeners } from './helpers';

export function useScenarioSuggestedEventLogging(params: {
  pendingProjectSelection: boolean;
  projectId: string | null;
  scenarioEnabled: boolean;
  screenshotMode: boolean;
}) {
  const { pendingProjectSelection, projectId, scenarioEnabled, screenshotMode } = params;

  useEffect(() => {
    if (!screenshotMode || !scenarioEnabled || pendingProjectSelection) {
      return;
    }

    return registerScenarioSuggestedEventListeners(projectId);
  }, [pendingProjectSelection, projectId, scenarioEnabled, screenshotMode]);
}
