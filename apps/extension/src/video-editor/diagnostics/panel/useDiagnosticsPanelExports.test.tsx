// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const { toastErrorMock } = vi.hoisted(() => ({
  toastErrorMock: vi.fn(),
}));

vi.mock('jszip', () => ({
  default: class BrokenZip {
    file() {
      return this;
    }

    async generateAsync() {
      throw new Error('zip failed');
    }
  },
}));

vi.mock('../../../platform/i18n', () => ({
  translate: (key: string) => key,
}));

vi.mock('@sniptale/ui/product-feedback/toast-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-feedback/toast-service')>()),
  toast: {
    error: toastErrorMock,
  },
}));

import { useDiagnosticsPanelExports } from './useDiagnosticsPanelExports';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latestExports: ReturnType<typeof useDiagnosticsPanelExports> | null = null;
let originalCreateElement: typeof document.createElement;

function Harness() {
  latestExports = useDiagnosticsPanelExports({
    events: [],
    filteredEvents: [],
    meta: null,
    recordingId: 'rec-1',
    stats: { actions: 0, console: 0, errors: 0, network: 0, total: 0, warns: 0 },
  });

  return null;
}

function getExports() {
  if (!latestExports) {
    throw new Error('Diagnostics exports are not ready');
  }

  return latestExports;
}

beforeEach(() => {
  toastErrorMock.mockReset();
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => 'blob:test'),
    revokeObjectURL: vi.fn(),
  });
  originalCreateElement = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
    if (tagName === 'a') {
      return {
        click: vi.fn(),
        download: '',
        href: '',
      } as unknown as HTMLAnchorElement;
    }

    return originalCreateElement(tagName);
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  latestExports = null;
  container?.remove();
  container = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('falls back to JSON export and shows a toast when ZIP export fails', async () => {
  await act(async () => {
    root?.render(<Harness />);
  });

  await act(async () => {
    await getExports().handleExportZIP();
  });

  expect(toastErrorMock).toHaveBeenCalledWith('videoEditor.diagnostics.zipFallbackAlert');
});
