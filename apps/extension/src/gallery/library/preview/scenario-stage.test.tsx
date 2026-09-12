// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createScenarioExportItem, createScenarioItem } from '../actions/test-support/index';

const { listScenarioPreviewStepsMock } = vi.hoisted(() => ({
  listScenarioPreviewStepsMock: vi.fn(),
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
    listScenarioPreviewSteps: listScenarioPreviewStepsMock,
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
  listScenarioPreviewStepsMock.mockResolvedValue([]);

  act(() => {
    root?.render(<PreviewScenarioStage item={createScenarioItem()} />);
  });
  await flushEffects();

  expect(container?.textContent).toContain('gallery.app.scenarioProjectsTitle');
  expect(container?.textContent).toContain('gallery.app.scenarioPreviewEmpty');
});

it('renders recent steps for scenario exports', async () => {
  listScenarioPreviewStepsMock.mockResolvedValue(
    Array.from({ length: 8 }, (_, index) => ({
      id: `step-${index}`,
      position: index,
      numberLabel: String(index + 1),
      images: [],
      title: index === 0 ? 'First step' : `Step title ${index}`,
    }))
  );

  act(() => {
    root?.render(
      <PreviewScenarioStage
        item={createScenarioExportItem({
          filename: 'scenario.html',
          project: {
            availability: 'available' as const,
            createdAt: 1,
            id: 'project-1',
            name: 'Scenario',
            tags: [],
            updatedAt: 2,
          },
        })}
      />
    );
  });
  await flushEffects();

  expect(container?.textContent).toContain('gallery.preview.kindScenarioExport');
  expect(container?.textContent).toContain('scenario.html');
  expect(container?.textContent).toContain('First step');
  expect(container?.textContent).toContain('gallery.app.scenarioStepLabel 1');
  expect(container?.querySelectorAll('article')).toHaveLength(8);
});
