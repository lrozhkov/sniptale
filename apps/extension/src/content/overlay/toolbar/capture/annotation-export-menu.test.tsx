// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createIntentSource: vi.fn<() => { kind: 'trusted-content-event' } | null>(() => ({
    kind: 'trusted-content-event',
  })),
  executeAction: vi.fn(),
  showToast: vi.fn(),
}));

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock('@sniptale/ui/product-feedback/toast-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-feedback/toast-service')>()),
  showToast: mocks.showToast,
}));

vi.mock('../../../application/privileged-action-intent', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../application/privileged-action-intent')>()),
  createTrustedContentActionIntentSource: mocks.createIntentSource,
}));

vi.mock('./annotation-export-actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./annotation-export-actions')>()),
  executeToolbarAnnotationExportAction: mocks.executeAction,
}));

import { AnnotationExportMenu } from './annotation-export-menu';
import { useToolbarMenuState } from '../state/menu';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function Harness() {
  const toolbarMenuState = useToolbarMenuState();
  return (
    <>
      <output data-ui="test.active-menu">{toolbarMenuState.activeMenuType ?? 'none'}</output>
      <AnnotationExportMenu
        compactMenus={false}
        disabled={false}
        displayMode="horizontal"
        toolbarMenuState={toolbarMenuState}
      />
    </>
  );
}

function renderMenu() {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root?.render(<Harness />);
  });
  act(() => {
    container
      ?.querySelector<HTMLButtonElement>('[data-ui="content.toolbar.annotation-export-button"]')
      ?.click();
  });
  return container!;
}

beforeEach(() => {
  mocks.createIntentSource.mockReset();
  mocks.createIntentSource.mockReturnValue({ kind: 'trusted-content-event' });
  mocks.executeAction.mockReset();
  mocks.showToast.mockReset();
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  container = null;
  root = null;
});

it('renders three interactive commands without the passive-chrome contract', () => {
  const view = renderMenu();
  const commands = Array.from(
    view.querySelectorAll<HTMLElement>('[data-ui^="content.toolbar.annotation-export."]')
  );

  expect(commands.map((command) => command.getAttribute('data-ui'))).toEqual([
    'content.toolbar.annotation-export.download',
    'content.toolbar.annotation-export.copy',
    'content.toolbar.annotation-export.open-export',
  ]);
  expect(commands.every((command) => !command.hasAttribute('data-sniptale-content-chrome'))).toBe(
    true
  );
});

it('runs one trusted action, disables duplicates, reports success, and restores focus', async () => {
  let resolveAction!: () => void;
  mocks.executeAction.mockImplementation(
    () => new Promise<void>((resolve) => (resolveAction = resolve))
  );
  const view = renderMenu();
  const trigger = view.querySelector<HTMLButtonElement>(
    '[data-ui="content.toolbar.annotation-export-button"]'
  )!;
  const download = view.querySelector<HTMLButtonElement>(
    '[data-ui="content.toolbar.annotation-export.download"]'
  )!;

  act(() => download.click());
  expect(mocks.executeAction).toHaveBeenCalledWith('download', {
    kind: 'trusted-content-event',
  });
  expect(download.disabled).toBe(true);
  act(() => download.click());
  expect(mocks.executeAction).toHaveBeenCalledTimes(1);

  await act(async () => {
    resolveAction();
    await Promise.resolve();
  });
  await act(async () => Promise.resolve());

  expect(view.querySelector('[data-ui="test.active-menu"]')?.textContent).toBe('none');
  expect(mocks.showToast).toHaveBeenCalledWith(
    'content.toolbar.annotationExportDownloadSuccess',
    'success'
  );
  expect(document.activeElement).toBe(trigger);
});

it('keeps a failed action retryable and rejects untrusted privileged clicks', async () => {
  mocks.executeAction.mockRejectedValueOnce(new Error('denied'));
  const view = renderMenu();
  const download = view.querySelector<HTMLButtonElement>(
    '[data-ui="content.toolbar.annotation-export.download"]'
  )!;

  await act(async () => {
    download.click();
    await Promise.resolve();
  });
  await act(async () => Promise.resolve());

  expect(view.querySelector('[data-ui="test.active-menu"]')?.textContent).toBe(
    'annotations-export'
  );
  expect(download.disabled).toBe(false);
  expect(mocks.showToast).toHaveBeenCalledWith(
    'content.toolbar.annotationExportActionError',
    'error'
  );

  mocks.executeAction.mockClear();
  mocks.createIntentSource.mockReturnValueOnce(null);
  act(() => download.click());
  expect(mocks.executeAction).not.toHaveBeenCalled();

  const copy = view.querySelector<HTMLButtonElement>(
    '[data-ui="content.toolbar.annotation-export.copy"]'
  )!;
  mocks.createIntentSource.mockReturnValueOnce(null);
  act(() => copy.click());
  expect(mocks.executeAction).not.toHaveBeenCalled();
});
