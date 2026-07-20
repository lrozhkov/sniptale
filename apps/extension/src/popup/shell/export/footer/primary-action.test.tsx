// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const popupActionButtonMock = vi.hoisted(() => vi.fn());

vi.mock('../../../../ui/popup-shell/action-button', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../ui/popup-shell/action-button')>()),
  PopupActionButton: ({
    dataUi,
    disabled,
    iconClassName,
    label,
    onClick,
  }: {
    dataUi?: string;
    disabled?: boolean;
    iconClassName: string;
    label: string;
    onClick: () => void;
  }) => {
    popupActionButtonMock({ dataUi, disabled, iconClassName, label, onClick });
    return (
      <button type="button" data-ui={dataUi} disabled={disabled} onClick={onClick}>
        {label}
      </button>
    );
  },
}));

import { ExportFooterPrimaryActionButton } from './primary-action';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createProps(
  overrides: Partial<Parameters<typeof ExportFooterPrimaryActionButton>[0]> = {}
) {
  return {
    canExport: true,
    exportTitle: 'Экспортировать',
    isExporting: false,
    isResultReady: false,
    onCancelExport: vi.fn(),
    onResetExportView: vi.fn(),
    onStartExport: vi.fn(),
    ...overrides,
  };
}

async function renderButton(props: ReturnType<typeof createProps>) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<ExportFooterPrimaryActionButton {...props} />);
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  popupActionButtonMock.mockReset();
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

describe('ExportFooterPrimaryActionButton', () => {
  it('renders the export action when export is idle', async () => {
    await renderButton(createProps());

    expect(
      container?.querySelector('[data-ui="popup.export.export-button"]')?.textContent
    ).toContain('Экспортировать');
    expect(popupActionButtonMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        iconClassName: expect.stringContaining(
          'group-hover:text-[var(--sniptale-color-accent-emphasis)]'
        ),
      })
    );
  });

  it('renders the cancel action when export is active', async () => {
    const props = createProps({ isExporting: true });

    await renderButton(props);

    const button = container?.querySelector('[data-ui="popup.export.export-button"]');
    expect(button?.textContent).toContain('Остановить сбор');
    await act(async () => {
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(props.onCancelExport).toHaveBeenCalledTimes(1);
    expect(props.onStartExport).not.toHaveBeenCalled();
    expect(popupActionButtonMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        iconClassName: 'text-[var(--sniptale-color-text-primary)]',
      })
    );
  });
});

describe('ExportFooterPrimaryActionButton active states', () => {
  it('renders the done action when a completed export result is open', async () => {
    const props = createProps({ isResultReady: true });

    await renderButton(props);

    const button = container?.querySelector('[data-ui="popup.export.export-button"]');
    expect(button?.textContent).toContain('Готово');
    await act(async () => {
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(props.onResetExportView).toHaveBeenCalledTimes(1);
    expect(props.onStartExport).not.toHaveBeenCalled();
    expect(popupActionButtonMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        iconClassName: 'text-[var(--sniptale-color-text-primary)]',
      })
    );
  });
});
