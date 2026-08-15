// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  openImageEditor: vi.fn(),
  openLibrary: vi.fn(),
  openScenarioEditor: vi.fn(),
  openScreenshotMode: vi.fn(),
  openVideoEditor: vi.fn(),
  triggerScreenshotCapture: vi.fn(),
  navigateToDescriptor: vi.fn(),
  pageAccessRuntime: {
    disabledReason: null as string | null,
    error: null as string | null,
    handleRequest: vi.fn(),
    loading: false,
    pendingOperation: null as null,
    status: null as null | {
      allSitesGranted: boolean;
      currentTabActive: boolean;
      currentTabId: number;
      currentTabOrigin: string;
      siteGranted: boolean;
      supported: boolean;
    },
  },
}));

vi.mock('../../../platform/i18n/popup', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n/popup')>()),
  translate: (key: string) => key,
}));
vi.mock('../tab-access/capabilities', () => ({
  useActiveTabCapabilities: () => ({ screenshotMode: { reason: null } }),
}));
vi.mock('../runtime/page-access', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../runtime/page-access')>()),
  usePopupPageAccessRuntime: () => mocks.pageAccessRuntime,
}));
vi.mock('../navigation/actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../navigation/actions')>()),
  openGithubRepository: vi.fn(),
  openImageEditor: mocks.openImageEditor,
  openLibrary: mocks.openLibrary,
  openScenarioEditor: mocks.openScenarioEditor,
  openScreenshotMode: mocks.openScreenshotMode,
  openSettings: vi.fn(),
  openVideoEditor: mocks.openVideoEditor,
  triggerScreenshotCapture: mocks.triggerScreenshotCapture,
}));
vi.mock('../footer', () => ({ default: () => <footer data-testid="menu-footer" /> }));

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.pageAccessRuntime.disabledReason = null;
  mocks.pageAccessRuntime.error = null;
  mocks.pageAccessRuntime.status = null;
  mocks.openScreenshotMode.mockResolvedValue(undefined);
  mocks.triggerScreenshotCapture.mockResolvedValue(undefined);
  container = document.createElement('div');
  root = createRoot(container);
  document.body.appendChild(container);
});

it('replaces the primary capture cards with page-access controls when the tab is inactive', async () => {
  mocks.pageAccessRuntime.disabledReason = 'popup.home.pageAccessRequired';
  mocks.pageAccessRuntime.status = {
    allSitesGranted: false,
    currentTabActive: false,
    currentTabId: 1,
    currentTabOrigin: 'https://example.test',
    siteGranted: false,
    supported: true,
  };
  const { MenuRoute } = await import('./route');
  act(() => root.render(<MenuRoute navigateToDescriptor={mocks.navigateToDescriptor} />));

  expect(container.querySelector('[data-ui="popup.page-access.controls"]')).not.toBeNull();
  expect(container.textContent).not.toContain('popup.home.captureVisibleLabel');
  expect(container.textContent).toContain('popup.home.enableForTab');
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

it('runs canonical transient screenshot downloads without persisting quick actions', async () => {
  const { MenuRoute } = await import('./route');
  act(() => root.render(<MenuRoute navigateToDescriptor={mocks.navigateToDescriptor} />));

  await act(async () => {
    container.querySelector<HTMLButtonElement>('[title="popup.home.captureFullHint"]')?.click();
  });

  expect(mocks.triggerScreenshotCapture).toHaveBeenCalledWith({
    screenshotMode: 'full',
    viewportPresetId: null,
    delay: null,
    afterCapture: 'download_default',
    imageFormat: null,
    imageQuality: null,
    exitAfterCapture: false,
  });
});

it('wires the workspace, toolbar and menu-only footer', async () => {
  const { MenuRoute } = await import('./route');
  act(() => root.render(<MenuRoute navigateToDescriptor={mocks.navigateToDescriptor} />));

  const clickLabel = (label: string) =>
    [...container.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.includes(label))
      ?.click();
  act(() => {
    clickLabel('popup.home.libraryLabel');
    clickLabel('popup.home.videoEditorLabel');
    clickLabel('popup.home.imageEditorLabel');
    clickLabel('popup.home.scenarioEditorLabel');
    clickLabel('popup.home.toolsOpenLabel');
  });

  expect(mocks.openLibrary).toHaveBeenCalledWith();
  expect(mocks.openVideoEditor).toHaveBeenCalledOnce();
  expect(mocks.openImageEditor).toHaveBeenCalledOnce();
  expect(mocks.openScenarioEditor).toHaveBeenCalledOnce();
  expect(mocks.openScreenshotMode).toHaveBeenCalledOnce();
  expect(container.querySelector('[data-ui="popup.menu.workspace"]')?.className).toBe(
    'mt-auto shrink-0'
  );
  expect(container.querySelector('[data-ui="popup.menu.toolbar-action"]')?.className).toContain(
    'col-span-2'
  );
  expect(
    [...container.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('popup.home.toolsOpenLabel')
    )?.className
  ).toContain('hover:bg-[var(--sniptale-color-surface-hover)]');
  expect(
    [...container.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('popup.home.toolsOpenLabel')
    )?.className
  ).toContain('hover:border-[var(--sniptale-color-border-accent-soft)]');
  expect(container.querySelector('[data-testid="menu-footer"]')).not.toBeNull();
});

it('runs the secondary current-tab capture scenarios and opens Video in tab mode', async () => {
  const { MenuRoute } = await import('./route');
  act(() => root.render(<MenuRoute navigateToDescriptor={mocks.navigateToDescriptor} />));

  const clickLabel = (label: string) =>
    [...container.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.includes(label))
      ?.click();

  await act(async () => clickLabel('popup.home.quickEditTabLabel'));
  expect(mocks.triggerScreenshotCapture).toHaveBeenLastCalledWith(
    expect.objectContaining({ screenshotMode: 'visible', afterCapture: 'edit' })
  );

  act(() => root.render(<></>));
  act(() => root.render(<MenuRoute navigateToDescriptor={mocks.navigateToDescriptor} />));
  mocks.triggerScreenshotCapture.mockClear();
  await act(async () => clickLabel('popup.home.quickCopyTabLabel'));
  expect(mocks.triggerScreenshotCapture).toHaveBeenLastCalledWith(
    expect.objectContaining({
      screenshotMode: 'visible',
      afterCapture: 'copy',
      imageFormat: 'png',
    })
  );

  act(() => root.render(<></>));
  act(() => root.render(<MenuRoute navigateToDescriptor={mocks.navigateToDescriptor} />));
  act(() => clickLabel('popup.home.quickRecordTabLabel'));
  expect(mocks.navigateToDescriptor).toHaveBeenCalledWith({ page: 'video', videoMode: 'TAB' });
});

it('surfaces a rejected toolbar operation through the menu alert', async () => {
  mocks.openScreenshotMode.mockRejectedValue(new Error('Toolbar unavailable'));
  const { MenuRoute } = await import('./route');
  act(() => root.render(<MenuRoute navigateToDescriptor={mocks.navigateToDescriptor} />));

  const toolbarButton = [...container.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.textContent?.includes('popup.home.toolsOpenLabel')
  );
  await act(async () => toolbarButton?.click());

  expect(container.querySelector('[role="alert"]')?.textContent).toContain('Toolbar unavailable');
});
