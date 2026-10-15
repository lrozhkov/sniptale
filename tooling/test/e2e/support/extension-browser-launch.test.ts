import { afterEach, expect, it, vi } from 'vitest';
import { deriveChromeExtensionId, launchExtensionBrowser } from './extension-browser-launch';

it('derives the deterministic Chrome extension ID from a manifest public key', () => {
  expect(deriveChromeExtensionId('AQ==')).toBe('elpfbccpdeeffemfdlnocollimnclhod');
});

it('rejects malformed manifest public keys before deriving an extension ID', () => {
  expect(() => deriveChromeExtensionId('not base64')).toThrow(/valid base64/u);
  expect(() => deriveChromeExtensionId('A')).toThrow(/valid base64/u);
});

const browserIo = vi.hoisted(() => ({ launch: vi.fn() }));
vi.mock('playwright', () => ({ chromium: { launchPersistentContext: browserIo.launch } }));
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(async () => '{}'),
  mkdtemp: vi.fn(async () => '/tmp/sniptale-browser-test'),
  rm: vi.fn(async () => {}),
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

function preparePersistentBrowser() {
  const session = {
    send: vi.fn(async () => ({ id: 'extension-test' })),
    detach: vi.fn(async () => {}),
  };
  const context = {
    browser: () => ({ newBrowserCDPSession: async () => session }),
    pages: () => [{ getByRole: () => ({ isVisible: async () => false }) }],
    close: vi.fn(async () => {}),
  };
  browserIo.launch.mockResolvedValue(context);
  return session;
}

it('configures the persistent context viewport and DPR before loading the MV3 extension', async () => {
  vi.stubEnv('SNIPTALE_E2E_VIEWPORT', '1280x560');
  const session = preparePersistentBrowser();
  const launched = await launchExtensionBrowser({ userDataDir: '/tmp/explicit-profile' });
  expect(browserIo.launch).toHaveBeenCalledWith(
    '/tmp/explicit-profile',
    expect.objectContaining({ viewport: { width: 1280, height: 560 }, deviceScaleFactor: 1 })
  );
  expect(browserIo.launch.mock.invocationCallOrder[0]).toBeLessThan(
    session.send.mock.invocationCallOrder[0]!
  );
  expect(session.send).toHaveBeenCalledWith('Extensions.loadUnpacked', {
    path: expect.any(String),
  });
  expect(launched.extensionId).toBe('extension-test');
});

it('preserves explicit manual launch sizes instead of replacing them with a preset', async () => {
  vi.stubEnv('SNIPTALE_E2E_VIEWPORT', '1920x900');
  preparePersistentBrowser();
  await launchExtensionBrowser({
    userDataDir: '/tmp/explicit-profile',
    viewport: { width: 900, height: 650 },
  });
  expect(browserIo.launch).toHaveBeenCalledWith(
    '/tmp/explicit-profile',
    expect.objectContaining({ viewport: { width: 900, height: 650 }, deviceScaleFactor: 1 })
  );
});

it('rejects invalid run presets before starting Chromium', async () => {
  vi.stubEnv('SNIPTALE_E2E_VIEWPORT', 'mobile');
  await expect(launchExtensionBrowser()).rejects.toThrow(/SNIPTALE_E2E_VIEWPORT/u);
  expect(browserIo.launch).not.toHaveBeenCalled();
});

it('isolates fake camera and named window selection to the requested browser profile', async () => {
  preparePersistentBrowser();
  await launchExtensionBrowser({
    userDataDir: '/tmp/camera-profile',
    fakeMediaDevices: true,
    windowCaptureTitle: 'Native recording window',
  });
  const args = browserIo.launch.mock.calls[0]?.[1]?.args;
  expect(args).toContain('--use-fake-device-for-media-stream=fps=30');
  expect(args).toContain('--use-fake-ui-for-media-stream');
  expect(args).toContain('--auto-select-window-capture-source-by-title=Native recording window');
  expect(args).not.toContain('--auto-select-screen-capture-source');
  await launchExtensionBrowser({ userDataDir: '/tmp/tab-profile' });
  const tabArgs = browserIo.launch.mock.calls[1]?.[1]?.args;
  expect(tabArgs).not.toContain('--use-fake-device-for-media-stream=fps=30');
  expect(tabArgs).toContain('--auto-select-screen-capture-source');
});
