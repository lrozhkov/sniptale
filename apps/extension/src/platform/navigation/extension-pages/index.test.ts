import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  browserTabsCreateMock,
  browserTabsQueryMock,
  browserTabsUpdateMock,
  browserWindowsCreateMock,
  browserWindowsUpdateMock,
  runtimeGetUrlMock,
} = vi.hoisted(() => ({
  browserTabsCreateMock: vi.fn(),
  browserTabsQueryMock: vi.fn(),
  browserTabsUpdateMock: vi.fn(),
  browserWindowsCreateMock: vi.fn(),
  browserWindowsUpdateMock: vi.fn(),
  runtimeGetUrlMock: vi.fn((path: string) => `chrome-extension://test/${path}`),
}));

vi.mock('@sniptale/platform/browser/tabs', () => ({
  browserTabs: {
    create: browserTabsCreateMock,
    query: browserTabsQueryMock,
    update: browserTabsUpdateMock,
  },
}));

vi.mock('@sniptale/platform/browser/windows', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/windows')>()),
  browserWindows: {
    create: browserWindowsCreateMock,
    update: browserWindowsUpdateMock,
  },
}));

vi.mock('@sniptale/platform/browser/runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/runtime')>()),
  runtimeInfo: {
    getURL: runtimeGetUrlMock,
  },
}));

vi.mock('@sniptale/platform/security/secure-random-id', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/security/secure-random-id')>()),
  createSecureRandomUuid: vi.fn(() => 'test-session'),
}));

const EXTENSION_SOURCE_ROOT = 'apps/extension/src';
const EXTENSION_URL_ROOT = `chrome-extension://test/${EXTENSION_SOURCE_ROOT}`;
const SETTINGS_PAGE_PATH = `${EXTENSION_SOURCE_ROOT}/settings/index.html`;
const SETTINGS_PAGE_URL = `${EXTENSION_URL_ROOT}/settings/index.html`;
const POPUP_PAGE_URL = `${EXTENSION_URL_ROOT}/popup/index.html`;

beforeEach(() => {
  vi.clearAllMocks();
  browserTabsCreateMock.mockResolvedValue(undefined);
  browserTabsQueryMock.mockResolvedValue([]);
  browserTabsUpdateMock.mockResolvedValue(undefined);
  browserWindowsCreateMock.mockResolvedValue(undefined);
  browserWindowsUpdateMock.mockResolvedValue(undefined);
});

describe('extension page settings helpers', () => {
  it('identifies extension-owned settings page urls', expectOwnedSettingsPageIdentity);

  it('opens the settings page through the shared browser tabs seam', async () => {
    const { openSettingsPage } = await import('./index');

    await openSettingsPage();

    expect(runtimeGetUrlMock).toHaveBeenCalledWith('apps/extension/src/settings/index.html');
    expect(browserTabsCreateMock).toHaveBeenCalledWith({
      url: 'chrome-extension://test/apps/extension/src/settings/index.html',
    });
  });

  it('focuses an existing settings tab and routes to a requested section', async () => {
    browserTabsQueryMock.mockResolvedValueOnce([{ id: 7, windowId: 9 }]);
    const { openSettingsPage } = await import('./index');

    await openSettingsPage({ section: 'native-hotkeys' });

    expect(browserTabsUpdateMock).toHaveBeenCalledWith(7, {
      active: true,
      url: 'chrome-extension://test/apps/extension/src/settings/index.html?section=native-hotkeys',
    });
    expect(browserWindowsUpdateMock).toHaveBeenCalledWith(9, { focused: true });
    expect(browserTabsCreateMock).not.toHaveBeenCalled();
  });
});

async function expectOwnedSettingsPageIdentity() {
  const { isOwnedSettingsPage } = await import('./index');

  expect(isOwnedSettingsPage(`${SETTINGS_PAGE_URL}?tab=privacy`)).toBe(true);
  expect(isOwnedSettingsPage(POPUP_PAGE_URL)).toBe(false);
  expect(isOwnedSettingsPage(`${SETTINGS_PAGE_URL}.evil`)).toBe(false);
  expect(isOwnedSettingsPage(`${SETTINGS_PAGE_URL}/extra`)).toBe(false);
  expect(isOwnedSettingsPage(`${EXTENSION_URL_ROOT}/%73ettings/index.html`)).toBe(false);
  expect(isOwnedSettingsPage(`https://example.test/${SETTINGS_PAGE_PATH}`)).toBe(false);
  expect(isOwnedSettingsPage(undefined)).toBe(false);
}

describe('extension page editor helpers', () => {
  it('opens the image editor through the shared editor url helper', async () => {
    const { openImageEditorPage } = await import('./index');

    await openImageEditorPage();

    expect(browserTabsCreateMock).toHaveBeenCalledWith({
      url: 'chrome-extension://test/apps/extension/src/editor/index.html?session=test-session',
    });
  });
});

it('builds and opens gallery pages through runtime urls', async () => {
  const { openGalleryPage, openGalleryWebSnapshotsPage } = await import('./index');

  await openGalleryPage();
  await openGalleryPage({ openStorageManager: true });
  await openGalleryPage({ recordingId: 'recording-9' });
  await openGalleryWebSnapshotsPage();

  expect(runtimeGetUrlMock).toHaveBeenNthCalledWith(1, 'apps/extension/src/gallery/index.html');
  expect(runtimeGetUrlMock).toHaveBeenNthCalledWith(2, 'apps/extension/src/gallery/index.html');
  expect(runtimeGetUrlMock).toHaveBeenNthCalledWith(3, 'apps/extension/src/gallery/index.html');
  expect(runtimeGetUrlMock).toHaveBeenNthCalledWith(4, 'apps/extension/src/gallery/index.html');
  expect(browserTabsCreateMock).toHaveBeenNthCalledWith(1, {
    url: 'chrome-extension://test/apps/extension/src/gallery/index.html',
  });
  expect(browserTabsCreateMock).toHaveBeenNthCalledWith(2, {
    url: 'chrome-extension://test/apps/extension/src/gallery/index.html?storageManager=1',
  });
  expect(browserTabsCreateMock).toHaveBeenNthCalledWith(3, {
    url: 'chrome-extension://test/apps/extension/src/gallery/index.html?folder=recording&recordingId=recording-9',
  });
  expect(browserTabsCreateMock).toHaveBeenNthCalledWith(4, {
    url: 'chrome-extension://test/apps/extension/src/gallery/index.html?folder=web-snapshot',
  });
});

it('builds and opens video editor pages through runtime urls', async () => {
  const { openVideoEditorPage } = await import('./index');

  await openVideoEditorPage();
  await openVideoEditorPage('project-7', 'recording-9');

  expect(runtimeGetUrlMock).toHaveBeenNthCalledWith(
    1,
    'apps/extension/src/video-editor/index.html'
  );
  expect(runtimeGetUrlMock).toHaveBeenNthCalledWith(
    2,
    'apps/extension/src/video-editor/index.html'
  );
  expect(browserTabsCreateMock).toHaveBeenNthCalledWith(1, {
    url: 'chrome-extension://test/apps/extension/src/video-editor/index.html',
  });
  expect(browserTabsCreateMock).toHaveBeenNthCalledWith(2, {
    url: 'chrome-extension://test/apps/extension/src/video-editor/index.html?project=project-7&id=recording-9',
  });
});

it('opens camera recorder in a popup window and falls back to a tab', async () => {
  const { openCameraRecorderPage } = await import('./index');

  await openCameraRecorderPage({ launchToken: 'token-1', recordingId: 'recording-1' });
  browserWindowsCreateMock.mockRejectedValueOnce(new Error('popup unavailable'));
  await openCameraRecorderPage({ launchToken: 'token-2', recordingId: 'recording-2' });

  expect(browserWindowsCreateMock).toHaveBeenNthCalledWith(1, {
    height: 720,
    type: 'popup',
    url:
      'chrome-extension://test/apps/extension/src/camera-recorder/index.html?' +
      'recordingId=recording-1&launchToken=token-1',
    width: 960,
  });
  expect(browserTabsCreateMock).toHaveBeenLastCalledWith({
    url:
      'chrome-extension://test/apps/extension/src/camera-recorder/index.html?' +
      'recordingId=recording-2&launchToken=token-2',
  });
});

it('builds and opens the web snapshot viewer page through runtime urls', async () => {
  const { buildWebSnapshotViewerUrl, openWebSnapshotViewerPage } = await import('./index');

  await openWebSnapshotViewerPage('snapshot 1');

  expect(runtimeGetUrlMock).toHaveBeenCalledWith(
    'apps/extension/src/web-snapshot-viewer/index.html'
  );
  expect(browserTabsCreateMock).toHaveBeenCalledWith({
    url: 'chrome-extension://test/apps/extension/src/web-snapshot-viewer/index.html?snapshotId=snapshot+1',
  });
  expect(buildWebSnapshotViewerUrl('snapshot 1')).toBe(
    'chrome-extension://test/apps/extension/src/web-snapshot-viewer/index.html?snapshotId=snapshot+1'
  );
});

describe('extension page scenario helpers', () => {
  it('opens the scenario editor with optional project and step identifiers', async () => {
    const { openScenarioEditorPage } = await import('./index');

    await openScenarioEditorPage('project-1', 'step-2');
    await openScenarioEditorPage(null, undefined);

    expect(browserTabsCreateMock).toHaveBeenNthCalledWith(1, {
      url: 'chrome-extension://test/apps/extension/src/scenario-editor/index.html?projectId=project-1&stepId=step-2',
    });
    expect(browserTabsCreateMock).toHaveBeenNthCalledWith(2, {
      url: 'chrome-extension://test/apps/extension/src/scenario-editor/index.html',
    });
  });

  it('opens scenario audience view in a maximized popup window', async () => {
    const { openScenarioAudiencePage } = await import('./index');

    await openScenarioAudiencePage('project-1', 'session-1');

    expect(browserWindowsCreateMock).toHaveBeenCalledWith({
      state: 'maximized',
      type: 'popup',
      url:
        'chrome-extension://test/apps/extension/src/scenario-editor/index.html?' +
        'projectId=project-1&presentationView=audience&presentationSessionId=session-1',
    });
    expect(browserTabsCreateMock).not.toHaveBeenCalled();
  });

  it('falls back to a tab when audience popup creation is unavailable', async () => {
    browserWindowsCreateMock.mockRejectedValueOnce(new Error('unavailable'));
    const { openScenarioAudiencePage } = await import('./index');

    await openScenarioAudiencePage('project-1', 'session-1');

    expect(browserTabsCreateMock).toHaveBeenCalledWith({
      url:
        'chrome-extension://test/apps/extension/src/scenario-editor/index.html?' +
        'projectId=project-1&presentationView=audience&presentationSessionId=session-1',
    });
  });
});
