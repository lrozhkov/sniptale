// @vitest-environment jsdom
// @vitest-environment-options {"url":"file:///tmp/prepared.html"}

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { translate } from '../../../../platform/i18n';
import { pagePreparationHistory } from '../../../parser/page-preparation/history';
import { PagePreparationLocalSaveResultKind } from '../../../parser/page-preparation/local-save';
import { ToolbarLocalSaveControl } from './local-save';

const savePreparedLocalHtmlMock = vi.hoisted(() => vi.fn());
const showToastMock = vi.hoisted(() => vi.fn());

vi.mock('@sniptale/ui/product-feedback/toast-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-feedback/toast-service')>()),
  showToast: showToastMock,
}));

vi.mock('../../../parser/page-preparation/local-save', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../parser/page-preparation/local-save')>()),
  savePreparedLocalHtml: savePreparedLocalHtmlMock,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderLocalSaveControl() {
  if (!container) {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(<ToolbarLocalSaveControl />);
  });
}

function getSaveButton(): HTMLButtonElement | null {
  return container?.querySelector('[data-ui="content.toolbar.local-html-save-button"]') ?? null;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  Object.defineProperty(window, 'showSaveFilePicker', {
    configurable: true,
    value: vi.fn(),
  });
  vi.spyOn(pagePreparationHistory, 'hasOpenTransactions').mockReturnValue(false);
  vi.spyOn(pagePreparationHistory, 'isApplying').mockReturnValue(false);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  Reflect.deleteProperty(window, 'showSaveFilePicker');
  savePreparedLocalHtmlMock.mockReset();
  showToastMock.mockReset();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function registerVisibilityTests(): void {
  it('renders an icon-first save action for eligible local HTML pages', () => {
    renderLocalSaveControl();

    const button = getSaveButton();
    expect(button).not.toBeNull();
    expect(button?.textContent).toBe('');
    expect(button?.getAttribute('title')).toBe(translate('content.toolbar.localHtmlSaveLabel'));
  });
}

function registerSaveFeedbackTests(): void {
  it('delegates save clicks and shows saved feedback', async () => {
    savePreparedLocalHtmlMock.mockResolvedValue({
      fileHandle: { createWritable: vi.fn() },
      kind: PagePreparationLocalSaveResultKind.Saved,
      warnings: [],
    });
    renderLocalSaveControl();

    await act(async () => {
      getSaveButton()?.click();
    });

    expect(savePreparedLocalHtmlMock).toHaveBeenCalledOnce();
    expect(getSaveButton()?.getAttribute('data-status')).toBe('saved');
    expect(showToastMock).toHaveBeenCalledWith(
      translate('content.toolbar.localHtmlSaveSaved'),
      'success'
    );
  });

  it('surfaces write failures as persistent error state', async () => {
    savePreparedLocalHtmlMock.mockResolvedValue({
      kind: PagePreparationLocalSaveResultKind.Error,
      message: 'disk full',
    });
    renderLocalSaveControl();

    await act(async () => {
      getSaveButton()?.click();
    });

    expect(getSaveButton()?.getAttribute('data-status')).toBe('error');
    expect(showToastMock).toHaveBeenCalledWith(
      `${translate('content.toolbar.localHtmlSaveError')} disk full`,
      'error',
      5000
    );
  });
}

function registerHistoryBlockingTests(): void {
  it('disables save while a page-preparation history transaction is open', () => {
    vi.mocked(pagePreparationHistory.hasOpenTransactions).mockReturnValue(true);
    renderLocalSaveControl();

    const button = getSaveButton();
    expect(button?.hasAttribute('disabled')).toBe(true);
    expect(button?.getAttribute('title')).toBe(
      translate('content.toolbar.localHtmlSaveBlockedHistory')
    );
  });
}

function registerPermissionRetryTests(): void {
  it('drops a denied reused handle so the next save can request a fresh one', async () => {
    const savedHandle = { createWritable: vi.fn() };
    savePreparedLocalHtmlMock
      .mockResolvedValueOnce({
        fileHandle: savedHandle,
        kind: PagePreparationLocalSaveResultKind.Saved,
        warnings: [],
      })
      .mockResolvedValueOnce({ kind: PagePreparationLocalSaveResultKind.PermissionDenied })
      .mockResolvedValueOnce({
        fileHandle: { createWritable: vi.fn() },
        kind: PagePreparationLocalSaveResultKind.Saved,
        warnings: [],
      });
    renderLocalSaveControl();

    await act(async () => getSaveButton()?.click());
    await act(async () => getSaveButton()?.click());
    await act(async () => getSaveButton()?.click());

    expect(savePreparedLocalHtmlMock.mock.calls[1]?.[0]).toEqual({ fileHandle: savedHandle });
    expect(savePreparedLocalHtmlMock.mock.calls[2]?.[0]).toEqual({ fileHandle: null });
  });
}

describe('ToolbarLocalSaveControl on local HTML pages', () => {
  registerVisibilityTests();
  registerSaveFeedbackTests();
  registerHistoryBlockingTests();
  registerPermissionRetryTests();
});
