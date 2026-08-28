// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('../../../../ui/popup-shell/action-button', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../ui/popup-shell/action-button')>()),
  PopupActionButton: ({
    dataUi,
    disabled,
    label,
    onClick,
  }: {
    dataUi?: string;
    disabled?: boolean;
    label: string;
    onClick: () => void;
  }) => (
    <button type="button" data-ui={dataUi} disabled={disabled} onClick={onClick}>
      {label}
    </button>
  ),
}));

import { ExportFooterLayout } from './layout';

type ExportFooterLayoutProps = Parameters<typeof ExportFooterLayout>[0];

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createProps() {
  return {
    canCopyJson: true,
    canCopyMarkdown: true,
    canExport: true,
    copyJsonTitle: 'Copy JSON current tab',
    copyMarkdownTitle: 'Copy Markdown current tab',
    copiedFormat: null,
    exportTitle: 'Экспортировать',
    isExporting: false,
    isResultReady: false,
    onCancelExport: vi.fn(),
    onCopyJson: vi.fn(),
    onCopyMarkdown: vi.fn(),
    onResetExportView: vi.fn(),
    onStartExport: vi.fn(),
  };
}

async function renderLayout() {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<ExportFooterLayout {...createProps()} />);
  });
}

async function renderLayoutWith(overrides: Partial<ExportFooterLayoutProps>) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<ExportFooterLayout {...createProps()} {...overrides} />);
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
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

it('renders only Export and preview copy actions while idle', async () => {
  await renderLayout();

  expect(container?.firstElementChild?.className).toContain('rounded-[16px]');
  expect(container?.querySelector('[data-ui="popup.export.export-button"]')).not.toBeNull();
  expect(container?.querySelector('[data-ui="popup.export.web-snapshot-disclosure"]')).toBeNull();
  expect(container?.querySelector('[aria-label="Save web snapshot"]')).toBeNull();
  expect(container?.querySelectorAll('button')).toHaveLength(3);
});

it('shows only Done for a completed downloaded package', async () => {
  await renderLayoutWith({
    isResultReady: true,
  });

  expect(container?.querySelectorAll('button')).toHaveLength(1);
  expect(container?.textContent).toContain('Готово');
  expect(container?.textContent).not.toContain('Copy JSON');
  expect(container?.textContent).not.toContain('Copy Markdown');
});

it('shows only the cancellation action while an export is running', async () => {
  await renderLayoutWith({ isExporting: true });

  expect(container?.querySelectorAll('button')).toHaveLength(1);
  expect(container?.textContent).toContain('Остановить сбор');
  expect(container?.textContent).not.toContain('Copy JSON');
  expect(container?.textContent).not.toContain('Copy Markdown');
});

it('adds Open in Library beside Done for a completed Library save', async () => {
  const onOpenLibraryResult = vi.fn();
  await renderLayoutWith({
    isResultReady: true,
    onOpenLibraryResult,
    openLibraryResultTitle: 'Open in Library',
  });

  expect(container?.querySelectorAll('button')).toHaveLength(2);
  const libraryButton = Array.from(container?.querySelectorAll('button') ?? []).find((button) =>
    button.textContent?.includes('Open in Library')
  );
  libraryButton?.click();
  expect(onOpenLibraryResult).toHaveBeenCalledTimes(1);
});
