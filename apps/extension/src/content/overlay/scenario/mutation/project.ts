import { translate } from '../../../../platform/i18n';
import { showToast } from '@sniptale/ui/product-feedback/toast-service';
import type { ScenarioSessionState } from '@sniptale/runtime-contracts/scenario/types/session';
import { buildCreatedProjectResponse } from '../session/defaults';
import { createScenarioProject, setScenarioActiveProject } from '../runtime/transport/projects';
import type { ScenarioControllerResponse } from '../types';

export async function applyScenarioProjectSelection(args: {
  applyScenarioResponse: (response: ScenarioControllerResponse) => void;
  currentSession: ScenarioSessionState;
  projectId: string | null;
}) {
  const response = await setScenarioActiveProject({
    projectId: args.projectId,
    rememberProjectSelection: args.currentSession.rememberProjectSelection,
  });
  if (response?.success) {
    args.applyScenarioResponse(response);
  }
}

export async function applyScenarioProjectCreation(args: {
  applyScenarioResponse: (response: ScenarioControllerResponse) => void;
  currentSession: ScenarioSessionState;
  name: string;
  refreshSession: () => Promise<void>;
}) {
  const nextProjectName = args.name.trim() || translate('scenario.common.defaultProjectName');
  const response = await createScenarioProject({
    name: args.name,
    rememberProjectSelection: args.currentSession.rememberProjectSelection,
  });
  if (response?.success) {
    args.applyScenarioResponse(
      buildCreatedProjectResponse({
        currentSession: args.currentSession,
        nextProjectName,
        response,
      })
    );
    await args.refreshSession();
    return;
  }

  showToast(response?.error || translate('scenario.content.createProjectError'), 'error');
  throw new Error(response?.error || translate('scenario.content.createProjectError'));
}
