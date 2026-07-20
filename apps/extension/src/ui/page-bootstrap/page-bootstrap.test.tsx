// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const appBootstrapMocks = vi.hoisted(() => ({
  createRootMock: vi.fn(),
  initializeAppThemeMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  renderMock: vi.fn(),
}));

vi.mock('react-dom/client', () => ({
  createRoot: appBootstrapMocks.createRootMock,
}));

vi.mock('../theme/index', () => ({
  initializeAppTheme: appBootstrapMocks.initializeAppThemeMock,
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

    expect(appBootstrapMocks.initializeAppThemeMock).toHaveBeenCalledTimes(1);
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

    expect(appBootstrapMocks.initializeAppThemeMock).not.toHaveBeenCalled();
    expect(appBootstrapMocks.createRootMock).not.toHaveBeenCalled();
    expect(appBootstrapMocks.loggerErrorMock).toHaveBeenCalledWith(
      'Page bootstrap root container is missing'
    );
    expect(root).toBeNull();
  });
});
