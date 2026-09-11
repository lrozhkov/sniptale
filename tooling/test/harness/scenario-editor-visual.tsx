import { clearScenarioSavedHistory } from '../../../apps/extension/src/composition/persistence/scenario/retention';
import { createRoot } from 'react-dom/client';
import { harnessReady } from './browser-mocks/browser-mocks';
import { ScenarioEditorPage } from '../../../apps/extension/src/scenario-editor/page-shell/ScenarioEditorPage';
import {
  createGuideProject,
  createGuideStep,
  createGuideImageBlock,
  createGuideParagraphs,
} from '../../../apps/extension/src/features/scenario/project/public';
import { commitScenarioAggregateMutation } from '../../../apps/extension/src/composition/persistence/scenario/aggregate-mutations';
import { getScenarioProject } from '../../../apps/extension/src/composition/persistence/scenario/projects';
import { createScenarioAssetEntryFromBlob } from '../../../apps/extension/src/composition/persistence/scenario/store/capture-step/asset-entry';
import { initializeAppTheme } from '../../../apps/extension/src/ui/theme/index';
import { setLocalePreference } from '../../../apps/extension/src/platform/i18n';
import '@sniptale/ui/styles';
import '@sniptale/ui/styles/ai-modal';
import '@sniptale/ui/styles/glass';
import '@sniptale/ui/styles/toolbar';
import '@sniptale/ui/styles/overlays';

async function createFixtureImage(): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = 960;
  canvas.height = 540;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Visual fixture canvas is unavailable');
  context.fillStyle = '#e8eef5';
  context.fillRect(0, 0, 960, 540);
  context.fillStyle = '#15263d';
  context.fillRect(40, 40, 880, 80);
  context.fillStyle = '#ffffff';
  context.font = '28px sans-serif';
  context.fillText('Local guide screenshot', 64, 92);
  context.fillStyle = '#3672ce';
  context.fillRect(64, 170, 330, 220);
  context.fillStyle = '#ffffff';
  context.fillRect(430, 170, 450, 220);
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Fixture image encoding failed'))),
      'image/png'
    )
  );
}

async function seedGuide(projectId: string): Promise<void> {
  if (await getScenarioProject(projectId)) return;
  const project = createGuideProject('Local step guide', projectId);
  const { assetEntry } = await createScenarioAssetEntryFromBlob({
    blob: await createFixtureImage(),
    projectId,
  });
  const step = createGuideStep('Compare two images', 'compare');
  step.blocks = [
    {
      kind: 'text',
      id: 'description',
      paragraphs: createGuideParagraphs(
        'Two images belong to this one step.\nKeep the explanation with the screenshots.'
      ),
    },
    ...['before', 'after'].map((id) => ({
      ...createGuideImageBlock({
        id,
        assetId: assetEntry.id,
        width: 960,
        height: 540,
        source: { kind: 'import', filename: 'example.png' },
      }),
      alt: `${id} screenshot`,
      caption: id,
    })),
  ];
  project.items = [
    {
      kind: 'section',
      id: 'intro',
      title: 'Introduction',
      paragraphs: createGuideParagraphs('A guide built and stored locally.'),
    },
    step,
    createGuideStep('Text-only step', 'text-only'),
  ];
  await commitScenarioAggregateMutation(project, { children: { assetPuts: [assetEntry] } });
}

async function mountGuideHarness(): Promise<void> {
  await harnessReady;
  const params = new URLSearchParams(window.location.search);
  initializeAppTheme(params.get('theme') === 'dark' ? 'dark' : 'light');
  await setLocalePreference(params.get('locale') === 'ru' ? 'ru' : 'en');
  const projectId = params.get('projectId') ?? 'guide-visual';
  await seedGuide(projectId);
  if (params.get('clearHistory') === '1') {
    const project = await getScenarioProject(projectId);
    if (!project) throw new Error('Missing retention fixture');
    await clearScenarioSavedHistory(projectId, project.updatedAt);
    params.delete('clearHistory');
  }
  params.set('projectId', projectId);
  window.history.replaceState({}, '', `${window.location.pathname}?${params}`);
  const root = document.getElementById('root');
  if (!root) throw new Error('Missing guide harness root');
  createRoot(root).render(<ScenarioEditorPage />);
}

void mountGuideHarness();
