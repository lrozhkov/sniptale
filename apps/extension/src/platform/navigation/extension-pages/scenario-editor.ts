import { runtimeInfo } from '@sniptale/platform/browser/runtime';

interface ScenarioEditorUrlOptions {
  view?: 'guide' | 'tour';
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

  if (options.view) editorUrl.searchParams.set('view', options.view);

  return editorUrl.toString();
}
