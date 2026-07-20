// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

import { ExportFooterActions } from './actions';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createProps(overrides: Partial<Parameters<typeof ExportFooterActions>[0]> = {}) {
  return {
    canCopyJson: true,
    canCopyMarkdown: true,
    canExport: true,
    copyJsonTitle: 'Copy JSON current tab',
    copyMarkdownTitle: 'Copy Markdown current tab',
    copiedFormat: null,
    disabledTitle: null,
    isExporting: false,
    isResultReady: false,
    onCancelExport: vi.fn(),
    onCopyJson: vi.fn(),
    onCopyMarkdown: vi.fn(),
    onResetExportView: vi.fn(),
    onStartExport: vi.fn(),
    ...overrides,
  };
}

async function renderFooter(props: ReturnType<typeof createProps>) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<ExportFooterActions {...props} />);
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

describe('ExportFooterActions', () => {
  it('renders the export action in the primary footer slot when export is idle', async () => {
    await renderFooter(createProps());

    const primaryButton = container?.querySelector('[data-ui="popup.export.export-button"]');
    expect(primaryButton?.textContent).toContain('Экспортировать');
  });

  it('reuses the same-width primary footer slot for stopping an active export', async () => {
    const props = createProps({
      canExport: false,
      isExporting: true,
    });

    await renderFooter(props);

    const primaryButton = container?.querySelector('[data-ui="popup.export.export-button"]');
    expect(primaryButton?.textContent).toContain('Остановить сбор');

    await act(async () => {
      primaryButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(props.onCancelExport).toHaveBeenCalledTimes(1);
    expect(props.onStartExport).not.toHaveBeenCalled();
  });

  it('shows the done action while the completed export screen is open', async () => {
    await renderFooter(createProps({ isResultReady: true }));

    const primaryButton = container?.querySelector('[data-ui="popup.export.export-button"]');
    expect(primaryButton?.textContent).toContain('Готово');
  });
});
