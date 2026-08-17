// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  activeTabCapabilities: {
    screenshotMode: { reason: null as string | null },
    videoByMode: {
      SCREEN: { reason: null as string | null },
      TAB: { reason: null as string | null },
    },
  },
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
  useActiveTabCapabilities: () => mocks.activeTabCapabilities,
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
  mocks.activeTabCapabilities.screenshotMode.reason = null;
  mocks.activeTabCapabilities.videoByMode.SCREEN.reason = null;
  mocks.activeTabCapabilities.videoByMode.TAB.reason = null;
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

it('uses the shared screenshot icon set for visible, full-page, and selection capture', async () => {
  const { MenuRoute } = await import('./route');
  act(() => root.render(<MenuRoute navigateToDescriptor={mocks.navigateToDescriptor} />));

  expect(
    container.querySelector('[title="popup.home.captureVisibleHint"] svg')?.getAttribute('class')
  ).toContain('lucide-app-window');
  expect(
    container.querySelector('[title="popup.home.captureFullHint"] svg')?.getAttribute('class')
  ).toContain('lucide-unfold-vertical');
  expect(
    container.querySelector('[title="popup.home.captureSelectionHint"] svg')?.getAttribute('class')
  ).toContain('lucide-crop');
});

it('wires the workspace, direct page tools and menu-only footer', async () => {
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
    clickLabel('content.toolbar.drawingLabel');
    clickLabel('content.toolbar.highlighterLabel');
  });

  expect(mocks.openLibrary).toHaveBeenCalledWith();
  expect(mocks.openVideoEditor).toHaveBeenCalledOnce();
  expect(mocks.openImageEditor).toHaveBeenCalledOnce();
  expect(mocks.openScenarioEditor).toHaveBeenCalledOnce();
  expect(
    [...container.querySelectorAll('button')]
      .find((button) => button.textContent?.includes('popup.home.imageEditorLabel'))
      ?.querySelector('svg')
      ?.getAttribute('data-ui')
  ).toBe('popup.image-editor-icon');
  expect(
    [...container.querySelectorAll('button')]
      .find((button) => button.textContent?.includes('popup.home.scenarioEditorLabel'))
      ?.querySelector('svg')
      ?.getAttribute('class')
  ).toContain('lucide-scroll-text');
  expect(mocks.openScreenshotMode.mock.calls).toEqual([['drawing'], ['highlighter']]);
  expect(container.querySelector('[data-ui="popup.menu.workspace"]')?.className).toBe(
    'mt-auto shrink-0'
  );
  const toolButtons = [
    container.querySelector<HTMLButtonElement>('[data-ui="popup.menu.tool-action.drawing"]'),
    container.querySelector<HTMLButtonElement>('[data-ui="popup.menu.tool-action.highlighter"]'),
  ];
  expect(toolButtons.every((button) => button !== null)).toBe(true);
  expect(toolButtons.every((button) => button?.className.includes('min-h-12'))).toBe(true);
  expect(
    toolButtons.every((button) =>
      button?.className.includes('hover:bg-[var(--sniptale-color-surface-hover)]')
    )
  ).toBe(true);
  expect(
    toolButtons.every((button) =>
      button?.className.includes('hover:border-[var(--sniptale-color-border-accent-soft)]')
    )
  ).toBe(true);
  expect(container.querySelector('[data-testid="menu-footer"]')).not.toBeNull();
});

it('runs the secondary capture scenarios in their displayed order', async () => {
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
  mocks.triggerScreenshotCapture.mockClear();
  await act(async () => clickLabel('popup.home.quickDesktopEditLabel'));
  expect(mocks.triggerScreenshotCapture).toHaveBeenLastCalledWith(
    expect.objectContaining({
      screenshotMode: 'desktop',
      afterCapture: 'edit',
      imageFormat: null,
    })
  );

  act(() => root.render(<></>));
  act(() => root.render(<MenuRoute navigateToDescriptor={mocks.navigateToDescriptor} />));
  act(() => clickLabel('popup.home.quickRecordTabLabel'));
  expect(mocks.navigateToDescriptor).toHaveBeenCalledWith({ page: 'video', videoMode: 'TAB' });

  const quickScenarioLabels = [
    'popup.home.quickEditTabLabel',
    'popup.home.quickCopyTabLabel',
    'popup.home.quickDesktopEditLabel',
    'popup.home.quickRecordTabLabel',
  ];
  const quickScenarioGrid = [...container.querySelectorAll('div')].find((element) =>
    element.className.includes('grid-cols-4')
  );
  expect(quickScenarioGrid).toBeDefined();
  expect(
    [...(quickScenarioGrid?.querySelectorAll('button') ?? [])].map((button) => button.textContent)
  ).toEqual(quickScenarioLabels);
  expect(
    [...(quickScenarioGrid?.querySelectorAll('button') ?? [])].every((button) =>
      button.className.includes('grid-rows-[18px_20px]')
    )
  ).toBe(true);
  expect(
    [...(quickScenarioGrid?.querySelectorAll('button span') ?? [])].every((label) =>
      label.className.includes('min-h-5')
    )
  ).toBe(true);
});

it('keeps window or screen capture available when only tab capture is blocked', async () => {
  mocks.activeTabCapabilities.screenshotMode.reason = 'Tab capture blocked';
  const { MenuRoute } = await import('./route');
  act(() => root.render(<MenuRoute navigateToDescriptor={mocks.navigateToDescriptor} />));

  const desktopButton = [...container.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.textContent?.includes('popup.home.quickDesktopEditLabel')
  );
  const editTabButton = [...container.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.textContent?.includes('popup.home.quickEditTabLabel')
  );
  expect(desktopButton?.disabled).toBe(false);
  expect(editTabButton?.disabled).toBe(true);

  await act(async () => desktopButton?.click());
  expect(mocks.triggerScreenshotCapture).toHaveBeenCalledWith(
    expect.objectContaining({ screenshotMode: 'desktop', afterCapture: 'edit' })
  );
});

it('surfaces a rejected page-tool operation through the menu alert', async () => {
  mocks.openScreenshotMode.mockRejectedValue(new Error('Toolbar unavailable'));
  const { MenuRoute } = await import('./route');
  act(() => root.render(<MenuRoute navigateToDescriptor={mocks.navigateToDescriptor} />));

  const toolbarButton = container.querySelector<HTMLButtonElement>(
    '[data-ui="popup.menu.tool-action.drawing"]'
  );
  await act(async () => toolbarButton?.click());

  expect(container.querySelector('[role="alert"]')?.textContent).toContain('Toolbar unavailable');
});
