// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createScenarioExportItem, createScenarioItem } from '../actions/test-support/index';

const { listRecentScenarioStepsMock } = vi.hoisted(() => ({
  listRecentScenarioStepsMock: vi.fn(),
}));

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock(
  '../../../composition/persistence/scenario/store/project-steps/project-step-queries',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../../composition/persistence/scenario/store/project-steps/project-step-queries')
    >()),
    listRecentScenarioSteps: listRecentScenarioStepsMock,
  })
);

import { PreviewScenarioStage } from './scenario-stage';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

it('renders an empty scenario preview when no recent steps are available', async () => {
  listRecentScenarioStepsMock.mockResolvedValue([]);

  act(() => {
    root?.render(<PreviewScenarioStage item={createScenarioItem()} />);
  });
  await flushEffects();

  expect(container?.textContent).toContain('gallery.app.scenarioProjectsTitle');
  expect(container?.textContent).toContain('gallery.app.scenarioPreviewEmpty');
});

it('renders recent steps for scenario exports', async () => {
  listRecentScenarioStepsMock.mockResolvedValue([
    { id: 'step-1', position: 0, previewDataUrl: 'data:1', title: 'First step' },
    { id: 'step-2', position: 1, previewDataUrl: 'data:2', title: 'Second step' },
  ]);

  act(() => {
    root?.render(
      <PreviewScenarioStage
        item={createScenarioExportItem({
          filename: 'scenario.html',
          project: { createdAt: 1, id: 'project-1', name: 'Scenario', tags: [], updatedAt: 2 },
        })}
      />
    );
  });
  await flushEffects();

  expect(container?.textContent).toContain('gallery.preview.kindScenarioExport');
  expect(container?.textContent).toContain('scenario.html');
  expect(container?.textContent).toContain('First step');
  expect(container?.textContent).toContain('gallery.app.scenarioStepLabel 1');
  expect(container?.querySelectorAll('img')).toHaveLength(2);
});
