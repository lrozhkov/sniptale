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

vi.mock('./export-actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./export-actions')>()),
  executeToolbarAnnotationExportAction: mocks.executeAction,
}));

import { AnnotationExportMenu } from './export-menu';
import { useToolbarMenuState } from '../state/menu';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function Harness(props: { displayMode: 'horizontal' | 'vertical' }) {
  const toolbarMenuState = useToolbarMenuState();
  return (
    <>
      <output data-ui="test.active-menu">{toolbarMenuState.activeMenuType ?? 'none'}</output>
      <AnnotationExportMenu
        compactMenus={false}
        disabled={false}
        displayMode={props.displayMode}
        toolbarMenuState={toolbarMenuState}
      />
    </>
  );
}

function renderMenu(options?: {
  displayMode?: 'horizontal' | 'vertical';
  rect?: Partial<DOMRect>;
}) {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root?.render(<Harness displayMode={options?.displayMode ?? 'horizontal'} />);
  });
  const trigger = container.querySelector<HTMLButtonElement>(
    '[data-ui="content.toolbar.annotation-export-button"]'
  );
  if (!trigger) throw new Error('Expected annotation export trigger');
  vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue({
    bottom: 236,
    height: 36,
    left: 400,
    right: 436,
    top: 200,
    width: 36,
    x: 400,
    y: 200,
    toJSON: () => ({}),
    ...options?.rect,
  });
  act(() => {
    trigger.click();
  });
  return container!;
}

beforeEach(() => {
  vi.stubGlobal('innerHeight', 900);
  vi.stubGlobal('innerWidth', 1280);
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
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('uses the canonical toolbar trigger and horizontally aligns the menu with its anchor', () => {
  const view = renderMenu();
  const commands = Array.from(
    view.querySelectorAll<HTMLElement>('[data-ui^="content.toolbar.annotation-export."]')
  );

  expect(commands.map((command) => command.getAttribute('data-ui'))).toEqual([
    'content.toolbar.annotation-export.download',
    'content.toolbar.annotation-export.copy',
    'content.toolbar.annotation-export.export-page',
    'content.toolbar.annotation-export.configure-export',
  ]);
  expect(commands.every((command) => !command.hasAttribute('data-sniptale-content-chrome'))).toBe(
    true
  );
  const rootElement = view.querySelector<HTMLElement>(
    '[data-ui="content.toolbar.annotation-export"]'
  );
  const trigger = view.querySelector<HTMLButtonElement>(
    '[data-ui="content.toolbar.annotation-export-button"]'
  );
  expect(rootElement?.className).toContain('relative');
  expect(view.querySelector<HTMLElement>('.sniptale-popover-menu')?.style.left).toBe('0px');
  expect(view.querySelector<HTMLElement>('.sniptale-popover-menu')?.style.top).toBe(
    'calc(100% + 10px)'
  );
  expect(trigger?.className).toContain('sniptale-glass-toolbar-button');
  expect(trigger?.className).toContain('sniptale-toggle');
  expect(trigger?.dataset['active']).toBeUndefined();
  expect(trigger?.dataset['menuIndicator']).toBe('true');
  expect(trigger?.querySelector('.lucide-archive')).not.toBeNull();
});

it('exports the complete page directly and reserves the settings button for popup configuration', async () => {
  mocks.executeAction.mockResolvedValue(undefined);
  const view = renderMenu();
  const exportPage = view.querySelector<HTMLButtonElement>(
    '[data-ui="content.toolbar.annotation-export.export-page"]'
  )!;

  await act(async () => exportPage.click());
  expect(mocks.executeAction).toHaveBeenCalledWith('export-page', {
    kind: 'trusted-content-event',
  });

  const trigger = view.querySelector<HTMLButtonElement>(
    '[data-ui="content.toolbar.annotation-export-button"]'
  )!;
  act(() => trigger.click());
  const configure = view.querySelector<HTMLButtonElement>(
    '[data-ui="content.toolbar.annotation-export.configure-export"]'
  )!;
  await act(async () => configure.click());
  expect(mocks.executeAction).toHaveBeenLastCalledWith('configure-export', {
    kind: 'trusted-content-event',
  });
});

it('places the menu beside a vertical toolbar and clears the trigger highlight when closed', () => {
  const view = renderMenu({
    displayMode: 'vertical',
    rect: { bottom: 136, left: 100, right: 136, top: 100, x: 100, y: 100 },
  });
  const trigger = view.querySelector<HTMLButtonElement>(
    '[data-ui="content.toolbar.annotation-export-button"]'
  );
  const menu = view.querySelector<HTMLElement>('.sniptale-popover-menu');

  expect(menu?.className).toContain('sniptale-popover-side');
  expect(menu?.style.left).toBe('calc(100% + 10px)');
  expect(menu?.style.top).toBe('0px');
  expect(trigger?.dataset['active']).toBeUndefined();

  act(() => trigger?.click());

  expect(view.querySelector('.sniptale-popover-menu')).toBeNull();
  expect(trigger?.getAttribute('aria-expanded')).toBe('false');
  expect(trigger?.dataset['active']).toBeUndefined();
});

it('runs one trusted action, disables duplicates, reports success, and clears trigger focus', async () => {
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
  expect(document.activeElement).not.toBe(trigger);
  expect(trigger.matches(':focus')).toBe(false);
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
    'content.toolbar.annotationExportDownloadError',
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
