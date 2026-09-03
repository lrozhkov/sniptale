// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { ExportProgressSectionProps } from './types';

vi.mock('../../../../platform/i18n/popup', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n/popup')>()),
  translate: (key: string) => key,
}));

import { ExportProgressSectionView } from './view';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createProps(
  overrides: Partial<ExportProgressSectionProps> = {}
): ExportProgressSectionProps {
  return {
    isExporting: true,
    onCancel: vi.fn(),
    progress: {
      phase: 'idle',
      message: '',
      current: 0,
      total: 0,
      errors: [],
    },
    progressSteps: [{ key: 'json', label: 'JSON', status: 'pending', statusLabel: 'Pending' }],
    result: null,
    ...overrides,
  };
}

async function renderSection(props: ExportProgressSectionProps) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<ExportProgressSectionView {...props} />);
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

it('renders the phase fallback when no progress step is active', async () => {
  await renderSection(createProps());

  expect(container?.textContent).toContain('JSON');
  expect(container?.querySelector('.animate-spin')).not.toBeNull();
});

it('renders fallback result errors and allows an empty result description', async () => {
  await renderSection(
    createProps({
      progress: {
        phase: 'done',
        message: '',
        current: 0,
        total: 0,
        errors: ['Progress fallback'],
      },
      result: {
        success: false,
        errors: [],
        stats: { sectionsCount: 0, rowsCount: 0, filesCount: 0, filesFailed: 0 },
      },
    })
  );
  expect(container?.textContent).toContain('Progress fallback');

  await renderSection(
    createProps({
      progress: { phase: 'done', message: '', current: 0, total: 0, errors: [] },
      result: {
        success: false,
        errors: [],
        stats: { sectionsCount: 0, rowsCount: 0, filesCount: 0, filesFailed: 0 },
      },
    })
  );

  expect(container?.textContent).toContain('popup.export.finishedWithErrors');
});

it('renders progress error fallbacks and successful results without filenames', async () => {
  await renderSection(
    createProps({
      progress: {
        phase: 'error',
        message: '',
        current: 0,
        total: 0,
        errors: ['Runtime failure'],
      },
    })
  );
  expect(container?.textContent).toContain('Runtime failure');

  await renderSection(
    createProps({
      progress: { phase: 'error', message: '', current: 0, total: 0, errors: [] },
    })
  );
  expect(container?.textContent).toContain('popup.export.finishedWithErrors');

  await renderSection(
    createProps({
      progress: { phase: 'done', message: '', current: 0, total: 0, errors: [] },
      result: {
        success: true,
        errors: [],
        stats: { sectionsCount: 0, rowsCount: 0, filesCount: 0, filesFailed: 0 },
      },
    })
  );

  expect(container?.textContent).toContain('popup.export.completedTitle');
});

it('renders an active step without a download counter', async () => {
  await renderSection(
    createProps({
      progress: { phase: 'downloading', message: '', current: 0, total: 0, errors: [] },
      progressSteps: [{ key: 'files', label: 'Files', status: 'active', statusLabel: 'Active' }],
    })
  );

  expect(container?.textContent).toContain('Files');
  expect(container?.textContent).not.toContain('0/0');
});

it('keeps current-page context separate from the active producer counter', async () => {
  await renderSection(
    createProps({
      progress: {
        phase: 'downloading',
        message: 'popup.export.batchCollectingMessage Example page',
        current: 1,
        total: 4,
        errors: [],
      },
      progressSteps: [
        { key: 'files', label: 'Attachments', status: 'active', statusLabel: 'Active' },
      ],
    })
  );

  const description = container?.querySelector('[data-ui="popup.export.progress-description"]');
  expect(description?.textContent).toContain('popup.export.batchCollectingMessage Example page');
  expect(description?.textContent).not.toContain('Attachments');
  const activeStep = container?.querySelector('[data-status="active"]');
  expect(activeStep?.textContent).toContain('Attachments');
  expect(activeStep?.textContent).toContain('1/4');
});

it('shows a labelled, wrapping issue list during an in-progress batch', async () => {
  await renderSection(
    createProps({
      progress: {
        phase: 'downloading',
        message: 'Collecting page',
        current: 1,
        total: 4,
        errors: ['First page could not be prepared', 'Second page could not be prepared'],
      },
    })
  );

  const issues = container?.querySelector('[data-ui="popup.export.progress-issues"]');
  expect(issues?.textContent).toContain('popup.export.issuesTitle');
  expect(issues?.textContent).toContain('First page could not be prepared');
  expect(issues?.querySelector('.truncate')).toBeNull();
});

it('renders cancellation as a neutral stopped outcome without a user attribution', async () => {
  await renderSection(
    createProps({
      progress: {
        phase: 'cancelled',
        message: 'Ignored cancellation detail',
        current: 0,
        total: 0,
        errors: [],
      },
    })
  );

  expect(container?.textContent).toContain('content.runtime.exportCancelled');
  expect(container?.textContent).not.toContain('Ignored cancellation detail');
  expect(container?.querySelector('.lucide-circle-stop')).not.toBeNull();
});
