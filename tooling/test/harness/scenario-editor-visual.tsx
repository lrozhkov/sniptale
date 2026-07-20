import { createRoot } from 'react-dom/client';
import { harnessReady } from './browser-mocks';
import {
  createScenarioVisualBaselineAssets,
  createScenarioVisualBaselineProject,
  SCENARIO_VISUAL_BASELINE_SLIDE_IDS,
} from '../../../apps/extension/src/scenario-editor/workspace/visual-baseline/fixtures';
import { ScenarioV3EditorShell } from '../../../apps/extension/src/scenario-editor/page-shell';
import { saveScenarioAsset } from '../../../apps/extension/src/composition/persistence/scenario/projects';
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

async function seedScenarioVisualAssets(projectId: string): Promise<void> {
  await Promise.all(
    createScenarioVisualBaselineAssets(projectId).map((asset) => saveScenarioAsset(asset))
  );
}

async function mountScenarioEditorVisualHarness(): Promise<void> {
  await harnessReady;
  applyHarnessDocumentStyles();
  initializeAppTheme(readThemePreference());

  const project = createScenarioVisualBaselineProject();
  await seedScenarioVisualAssets(project.id);

  createRoot(document.getElementById('root')!).render(
    <ScenarioV3EditorShell
      initialSlideId={readInitialSlideId()}
      project={project}
      onProjectChange={() => undefined}
    />
  );
}

void mountScenarioEditorVisualHarness();
