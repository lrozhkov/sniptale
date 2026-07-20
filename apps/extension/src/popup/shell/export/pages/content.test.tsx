// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const sectionMocks = vi.hoisted(() => ({
  exportProgressSectionMock: vi.fn(),
  exportReadySectionMock: vi.fn(),
}));

vi.mock('../progress', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../progress')>()),
  ExportProgressSection: (props: unknown) => {
    sectionMocks.exportProgressSectionMock(props);
    return <div data-testid="progress-section">progress</div>;
  },
}));

vi.mock('../ready', () => ({
  ExportReadySection: (props: unknown) => {
    sectionMocks.exportReadySectionMock(props);
    return <div data-testid="ready-section">ready</div>;
  },
}));

vi.unmock('./content');

import { ExportPageContent } from './content';
import { createPopupExportControllerFixture } from './controller.test-support';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

async function renderContent(controller: ReturnType<typeof createPopupExportControllerFixture>) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<ExportPageContent controller={controller} />);
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  sectionMocks.exportProgressSectionMock.mockReset();
  sectionMocks.exportReadySectionMock.mockReset();
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

it('renders progress while export is active', async () => {
  const controller = createPopupExportControllerFixture({
    derived: {
      isExporting: true,
      progressSteps: [{ key: 'json', label: 'JSON', status: 'active', statusLabel: 'В процессе' }],
    },
  });

  await renderContent(controller);

  expect(container?.textContent).toContain('progress');
  expect(sectionMocks.exportProgressSectionMock).toHaveBeenCalledWith(
    expect.objectContaining({
      isExporting: true,
      progressSteps: controller.state.derived.progressSteps,
    })
  );
});

it('renders progress after export completion when result is present', async () => {
  await renderContent(
    createPopupExportControllerFixture({
      session: {
        result: {
          success: true,
          filename: 'archive.zip',
          errors: [],
          stats: {
            sectionsCount: 1,
            rowsCount: 0,
            filesCount: 0,
            filesFailed: 0,
          },
        },
      },
    })
  );

  expect(container?.textContent).toContain('progress');
  expect(sectionMocks.exportProgressSectionMock).toHaveBeenCalledTimes(1);
});

it('keeps the progress surface visible when export ends in an error before a result exists', async () => {
  await renderContent(
    createPopupExportControllerFixture({
      session: {
        progress: {
          activeStepKey: null,
          current: 0,
          errors: ['stale runtime'],
          message: 'stale runtime',
          phase: 'error',
          total: 0,
        },
        result: null,
      },
    })
  );

  expect(container?.textContent).toContain('progress');
  expect(sectionMocks.exportProgressSectionMock).toHaveBeenCalledTimes(1);
});

it('renders the ready state with selection props and disabled state', async () => {
  await renderContent(
    createPopupExportControllerFixture({
      derived: { exportDisabledReason: 'blocked' },
      preferences: { hasLoadedPreferences: false },
      tabs: {
        selectedCount: 0,
        selectedTabIds: [],
      },
    })
  );

  expect(container?.textContent).toContain('ready');
  expect(sectionMocks.exportReadySectionMock).toHaveBeenCalledWith(
    expect.objectContaining({
      disabled: true,
      hasLoadedPreferences: false,
      selectedCount: 0,
      selectedTabIds: [],
    })
  );
});
