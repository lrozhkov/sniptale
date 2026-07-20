import { runtimeInfo } from '@sniptale/platform/browser/runtime';
import {
  SCENARIO_PRESENTATION_VIEWS,
  type ScenarioPresentationView,
} from '@sniptale/runtime-contracts/scenario-editor/session';

interface ScenarioEditorUrlOptions {
  presentationSessionId?: string | null;
  presentationView?: ScenarioPresentationView | null;
  projectId?: string | null;
  stepId?: string | null;
}

export function buildScenarioEditorUrl(options: ScenarioEditorUrlOptions = {}): string {
  const editorUrl = new URL(runtimeInfo.getURL('apps/extension/src/scenario-editor/index.html'));

  if (options.projectId) {
    editorUrl.searchParams.set('projectId', options.projectId);
  }

  if (options.stepId) {
    editorUrl.searchParams.set('stepId', options.stepId);
  }

  if (options.presentationView === SCENARIO_PRESENTATION_VIEWS.audience) {
    editorUrl.searchParams.set('presentationView', options.presentationView);
  }

  if (options.presentationSessionId) {
    editorUrl.searchParams.set('presentationSessionId', options.presentationSessionId);
  }

  return editorUrl.toString();
}
