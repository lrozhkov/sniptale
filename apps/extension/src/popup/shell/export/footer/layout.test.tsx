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
    canSaveWebSnapshot: true,
    copyJsonTitle: 'Copy JSON current tab',
    copyMarkdownTitle: 'Copy Markdown current tab',
    copiedFormat: null,
    exportTitle: 'Экспортировать',
    isExporting: false,
    isSavingWebSnapshot: false,
    isResultReady: false,
    onCancelExport: vi.fn(),
    onCopyJson: vi.fn(),
    onCopyMarkdown: vi.fn(),
    onResetExportView: vi.fn(),
    onSaveWebSnapshot: vi.fn(),
    onStartExport: vi.fn(),
    saveWebSnapshotTitle: 'Save web snapshot',
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

it('renders the footer surface and all action slots without refresh control', async () => {
  await renderLayout();

  expect(container?.firstElementChild?.className).toContain('rounded-[16px]');
  expect(container?.querySelector('[data-ui="popup.export.export-button"]')).not.toBeNull();
  expect(container?.querySelector('[data-ui="popup.export.web-snapshot-disclosure"]')).toBeNull();
  expect(container?.querySelector('[aria-label="Save web snapshot"]')).not.toBeNull();
  expect(container?.querySelectorAll('button')).toHaveLength(4);
});

it('disables the snapshot action while it is saving or unavailable', async () => {
  await renderLayoutWith({ canSaveWebSnapshot: false, isSavingWebSnapshot: true });

  const snapshotButton = container?.querySelector('[aria-label="Save web snapshot"]');
  expect(snapshotButton).toHaveProperty('disabled', true);
  expect(snapshotButton?.querySelector('.animate-spin')).not.toBeNull();
});

it('keeps the snapshot action inert when optional handlers are omitted', async () => {
  await renderLayoutWith({
    canSaveWebSnapshot: undefined,
    onSaveWebSnapshot: undefined,
    saveWebSnapshotTitle: undefined,
  });

  const snapshotButton = container?.querySelector('[aria-label=""]');
  expect(snapshotButton).toHaveProperty('disabled', true);
  (snapshotButton as HTMLButtonElement | null)?.click();
});

it('uses the result action in the snapshot slot when a saved snapshot can be opened', async () => {
  const onOpenWebSnapshotResult = vi.fn();
  await renderLayoutWith({
    canSaveWebSnapshot: false,
    onOpenWebSnapshotResult,
    openWebSnapshotResultMode: 'open',
    openWebSnapshotResultTitle: 'Open snapshot',
  });

  const snapshotButton = container?.querySelector('[aria-label="Open snapshot"]');
  expect(snapshotButton).toHaveProperty('disabled', false);
  (snapshotButton as HTMLButtonElement | null)?.click();
  expect(onOpenWebSnapshotResult).toHaveBeenCalledTimes(1);
});
