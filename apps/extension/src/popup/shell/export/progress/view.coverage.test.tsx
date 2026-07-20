// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { ExportProgressSectionProps } from './types';

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
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
