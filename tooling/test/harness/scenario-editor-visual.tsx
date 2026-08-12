import { createRoot } from 'react-dom/client';
import { harnessReady } from './browser-mocks';
import {
  createScenarioVisualBaselineAssets,
  createScenarioVisualBaselineProject,
  SCENARIO_VISUAL_BASELINE_SLIDE_IDS,
} from '../../../apps/extension/src/scenario-editor/workspace/visual-baseline/fixtures';
import { ScenarioV3EditorShell } from '../../../apps/extension/src/scenario-editor/page-shell';
import { commitScenarioAggregateMutation } from '../../../apps/extension/src/composition/persistence/scenario/aggregate-mutations';
import {
  initializeAppTheme,
  type AppThemePreference,
} from '../../../apps/extension/src/ui/theme/index';
import '@sniptale/ui/styles';
import '@sniptale/ui/styles/ai-modal';
import '@sniptale/ui/styles/glass';
import '@sniptale/ui/styles/toolbar';
import '@sniptale/ui/styles/overlays';

const DEFAULT_SLIDE_ID = SCENARIO_VISUAL_BASELINE_SLIDE_IDS.capturedApp;

function readThemePreference(): AppThemePreference {
  const theme = new URLSearchParams(window.location.search).get('theme');
  return theme === 'dark' || theme === 'light' ? theme : 'light';
}

function readInitialSlideId(): string {
  return new URLSearchParams(window.location.search).get('slide') ?? DEFAULT_SLIDE_ID;
}

function applyHarnessDocumentStyles(): void {
  document.documentElement.style.width = '100%';
  document.documentElement.style.height = '100%';
  document.body.style.width = '100%';
  document.body.style.height = '100%';
  document.body.style.margin = '0';
  document.getElementById('root')?.style.setProperty('height', '100%');
}

async function mountScenarioEditorVisualHarness(): Promise<void> {
  await harnessReady;
  applyHarnessDocumentStyles();
  initializeAppTheme(readThemePreference());

  const project = createScenarioVisualBaselineProject();
  const committed = await commitScenarioAggregateMutation(project, {
    children: { assetPuts: createScenarioVisualBaselineAssets(project.id) },
  });

  createRoot(document.getElementById('root')!).render(
    <ScenarioV3EditorShell
      initialSlideId={readInitialSlideId()}
      project={committed.project}
      onProjectChange={() => undefined}
    />
  );
}

void mountScenarioEditorVisualHarness();
