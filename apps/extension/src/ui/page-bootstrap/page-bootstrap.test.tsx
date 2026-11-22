// @vitest-environment jsdom
vi.mock('../../composition/persistence/diagnostics/runtime-log', () => ({
  installRuntimeLogCapture: vi.fn(),
}));

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { installRuntimeLogCapture } from '../../composition/persistence/diagnostics/runtime-log';

const appBootstrapMocks = vi.hoisted(() => ({
  createRootMock: vi.fn(),
  prepare: vi.fn(),
  initializeExtensionPageThemeMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  renderMock: vi.fn(),
}));

vi.mock('../../platform/i18n', () => ({
  prepareTranslations: appBootstrapMocks.prepare,
  translate: (key: string) => key,
}));

vi.mock('react-dom/client', () => ({
  createRoot: appBootstrapMocks.createRootMock,
}));

vi.mock('../theme/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../theme/index')>()),
  initializeExtensionPageTheme: appBootstrapMocks.initializeExtensionPageThemeMock,
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({
    child: vi.fn(),
    debug: vi.fn(),
    error: appBootstrapMocks.loggerErrorMock,
    info: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  }),
}));

async function importPageBootstrapModule() {
  vi.resetModules();
  return import('./page-bootstrap');
}

describe('page-bootstrap renderPageShell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    appBootstrapMocks.prepare.mockResolvedValue(undefined);
    document.body.innerHTML = '<div id="root"></div>';
    appBootstrapMocks.createRootMock.mockReturnValue({
      render: appBootstrapMocks.renderMock,
    });
  });

  it('initializes theme, renders through the shared shell, and calls onRendered', async () => {
    const onRendered = vi.fn();
    const { renderPageShell } = await importPageBootstrapModule();

    const root = renderPageShell({
      element: <div>demo</div>,
      namespace: 'DemoEntrypoint',
      onRendered,
    });

    expect(installRuntimeLogCapture).toHaveBeenCalledWith('DemoEntrypoint');
    expect(appBootstrapMocks.initializeExtensionPageThemeMock).toHaveBeenCalledTimes(1);
    expect(appBootstrapMocks.createRootMock).toHaveBeenCalledWith(document.getElementById('root'));
    expect(appBootstrapMocks.renderMock).toHaveBeenCalledTimes(1);
    expect(onRendered).toHaveBeenCalledTimes(1);
    expect(root).not.toBeNull();
  });

  it('can skip theme initialization and logs when the root container is missing', async () => {
    document.body.innerHTML = '';
    const { renderPageShell } = await importPageBootstrapModule();

    const root = renderPageShell({
      element: <div>demo</div>,
      initializeTheme: false,
      namespace: 'DemoEntrypoint',
    });

    expect(appBootstrapMocks.initializeExtensionPageThemeMock).not.toHaveBeenCalled();
    expect(appBootstrapMocks.createRootMock).not.toHaveBeenCalled();
    expect(appBootstrapMocks.loggerErrorMock).toHaveBeenCalledWith(
      'Page bootstrap root container is missing'
    );
    expect(root).toBeNull();
  });
});

describe('page translation readiness', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    appBootstrapMocks.prepare.mockReset().mockResolvedValue(undefined);
    document.body.innerHTML = '<div id="root"></div>';
    appBootstrapMocks.createRootMock.mockReturnValue({ render: appBootstrapMocks.renderMock });
  });

  it('prepares the selected page profile before mounting its interface', async () => {
    let complete!: () => void;
    appBootstrapMocks.prepare.mockReturnValue(
      new Promise<void>((resolve) => {
        complete = resolve;
      })
    );
    const { renderPageShell } = await importPageBootstrapModule();
    const { createRoot } =
      await vi.importActual<typeof import('react-dom/client')>('react-dom/client');
    const onRendered = vi.fn();
    renderPageShell({
      element: <button data-testid="ready">ready</button>,
      namespace: 'EditorEntrypoint',
      onRendered,
    });
    const element = appBootstrapMocks.renderMock.mock.calls.at(-1)![0];
    const container = document.createElement('div');
    const root = createRoot(container);
    await act(async () => root.render(element));
    expect(appBootstrapMocks.prepare).toHaveBeenCalledWith('editor');
    expect(container.querySelector('button')).toBeNull();
    expect(onRendered).not.toHaveBeenCalled();
    await act(async () => complete());
    expect(container.querySelector('[data-testid="ready"]')).not.toBeNull();
    expect(onRendered).toHaveBeenCalledOnce();
    act(() => root.unmount());
  });

  it('shows a catalog-independent English retry after preparation failure', async () => {
    appBootstrapMocks.prepare.mockRejectedValueOnce(new Error('Catalog unavailable'));
    const { renderPageShell } = await importPageBootstrapModule();
    const { createRoot } =
      await vi.importActual<typeof import('react-dom/client')>('react-dom/client');
    renderPageShell({
      element: <span data-testid="ready">ready</span>,
      namespace: 'SettingsEntrypoint',
    });
    const element = appBootstrapMocks.renderMock.mock.calls.at(-1)![0];
    const container = document.createElement('div');
    const root = createRoot(container);
    await act(async () => root.render(element));
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      'This page failed to load'
    );
    expect(container.querySelector('button')?.textContent).toBe('Retry');
    await act(async () => container.querySelector('button')!.click());
    expect(appBootstrapMocks.prepare).toHaveBeenCalledTimes(2);
    expect(container.querySelector('[data-testid="ready"]')).not.toBeNull();
    act(() => root.unmount());
  });
});
