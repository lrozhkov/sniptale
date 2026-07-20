// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const {
  getScenarioProjectRecordMock,
  listRecentScenarioStepsMock,
  openScenarioEditorPageMock,
  translateMock,
} = vi.hoisted(() => ({
  getScenarioProjectRecordMock: vi.fn(),
  listRecentScenarioStepsMock: vi.fn(),
  openScenarioEditorPageMock: vi.fn(),
  translateMock: vi.fn((key: string) => key),
}));

vi.mock('../../../platform/i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../platform/i18n')>();

  return {
    ...actual,
    translate: translateMock,
  };
});

vi.mock('../../../platform/navigation/extension-pages/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/navigation/extension-pages/index')>()),
  openScenarioEditorPage: openScenarioEditorPageMock,
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

vi.mock(
  '../../../composition/persistence/scenario/store/project-records/index',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../../composition/persistence/scenario/store/project-records/index')
    >()),
    getScenarioProjectRecord: getScenarioProjectRecordMock,
  })
);

import { GalleryScenarioPreviewPanel } from './scenario-preview';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  listRecentScenarioStepsMock.mockResolvedValue([
    { id: 'step-1', position: 0, previewDataUrl: 'data:image/png;base64,one', title: 'Intro' },
  ]);
  getScenarioProjectRecordMock.mockResolvedValue({
    id: 'project-1',
    name: 'Scenario',
    steps: [{ id: 'step-1' }],
  });
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

it('loads recent scenario steps and opens the scenario editor from preview', async () => {
  const onClose = vi.fn();

  act(() => {
    root?.render(
      <GalleryScenarioPreviewPanel
        project={{ id: 'project-1', name: 'Scenario', createdAt: 1, updatedAt: 2 }}
        onClose={onClose}
      />
    );
  });

  await act(async () => {
    await Promise.resolve();
  });

  const buttons = Array.from(container?.querySelectorAll('button') ?? []);
  const editorButton = buttons.find((button) =>
    button.textContent?.includes('gallery.preview.openInEditor')
  );
  const closeButton = buttons.find((button) => button !== editorButton);

  if (!editorButton || !closeButton) {
    throw new Error('Expected scenario preview actions');
  }

  act(() => {
    editorButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    closeButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });

  expect(listRecentScenarioStepsMock).toHaveBeenCalledWith('project-1');
  expect(getScenarioProjectRecordMock).toHaveBeenCalledWith('project-1');
  expect(openScenarioEditorPageMock).toHaveBeenCalledWith('project-1');
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(container?.textContent).toContain('Intro');
});
