import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  browserActionOpenPopupMock,
  browserActionGetPopupMock,
  browserActionSetPopupMock,
  browserTabsCreateMock,
  browserTabsGetMock,
  browserTabsQueryMock,
  browserTabsUpdateMock,
  browserWindowsCreateMock,
  browserWindowsUpdateMock,
  runtimeGetUrlMock,
} = vi.hoisted(() => ({
  browserActionOpenPopupMock: vi.fn(),
  browserActionGetPopupMock: vi.fn(),
  browserActionSetPopupMock: vi.fn(),
  browserTabsCreateMock: vi.fn(),
  browserTabsGetMock: vi.fn(),
  browserTabsQueryMock: vi.fn(),
  browserTabsUpdateMock: vi.fn(),
  browserWindowsCreateMock: vi.fn(),
  browserWindowsUpdateMock: vi.fn(),
  runtimeGetUrlMock: vi.fn((path: string) => `chrome-extension://test/${path}`),
}));

vi.mock('@sniptale/platform/browser/action', () => ({
  browserAction: {
    openPopup: browserActionOpenPopupMock,
    getPopup: browserActionGetPopupMock,
    setPopup: browserActionSetPopupMock,
  },
}));

vi.mock('@sniptale/platform/browser/tabs', () => ({
  browserTabs: {
    create: browserTabsCreateMock,
    get: browserTabsGetMock,
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
  browserActionGetPopupMock.mockReset().mockResolvedValue(POPUP_PAGE_URL);
  browserActionSetPopupMock.mockReset().mockResolvedValue(undefined);
  browserActionOpenPopupMock.mockResolvedValue(undefined);
  browserTabsCreateMock.mockResolvedValue(undefined);
  browserTabsGetMock.mockResolvedValue(undefined);
  browserTabsQueryMock.mockResolvedValue([]);
  browserTabsUpdateMock.mockResolvedValue(undefined);
  browserWindowsCreateMock.mockResolvedValue(undefined);
  browserWindowsUpdateMock.mockResolvedValue(undefined);
});

describe('extension page settings helpers', () => {
  it.each(['microphone', 'camera'] as const)(
    'opens a one-shot %s request on the Permissions page',
    async (permission) => {
      const { openSettingsPage, SETTINGS_MEDIA_ACCESS_QUERY_PARAM } = await import('./index');
      await openSettingsPage({ route: { section: 'native-app' }, requestMediaAccess: permission });
      const url = new URL(browserTabsCreateMock.mock.calls[0]![0].url);
      expect(url.searchParams.get('section')).toBe('access-data');
      expect(url.searchParams.get('view')).toBe('permissions');
      expect(url.searchParams.getAll(SETTINGS_MEDIA_ACCESS_QUERY_PARAM)).toEqual([permission]);
    }
  );

  it('reuses an existing Settings tab for the targeted permission request', async () => {
    browserTabsQueryMock.mockResolvedValueOnce([
      { id: 3, windowId: 9, url: 'https://example.test' },
    ]);
    browserTabsQueryMock.mockResolvedValueOnce([{ id: 7, windowId: 9 }]);
    const { openSettingsPage } = await import('./index');
    await openSettingsPage({ requestMediaAccess: 'camera' });
    expect(browserTabsUpdateMock).toHaveBeenCalledExactlyOnceWith(7, {
      active: true,
      openerTabId: 3,
      url: `${SETTINGS_PAGE_URL}?section=access-data&view=permissions&requestMediaAccess=camera`,
    });
    expect(browserWindowsUpdateMock).toHaveBeenCalledExactlyOnceWith(9, { focused: true });
  });

  it('creates targeted Settings in the source window with its browser-owned opener', async () => {
    browserTabsQueryMock.mockResolvedValueOnce([
      { id: 3, windowId: 9, url: 'https://example.test' },
    ]);
    browserTabsQueryMock.mockResolvedValueOnce([{ id: 7, windowId: 10 }]);
    const { openSettingsPage } = await import('./index');
    await openSettingsPage({ requestMediaAccess: 'microphone' });
    expect(browserTabsQueryMock).toHaveBeenNthCalledWith(1, { active: true, currentWindow: true });
    expect(browserTabsQueryMock).toHaveBeenNthCalledWith(2, {
      url: `${SETTINGS_PAGE_URL}*`,
      windowId: 9,
    });
    expect(browserTabsCreateMock).toHaveBeenCalledExactlyOnceWith({
      url: `${SETTINGS_PAGE_URL}?section=access-data&view=permissions&requestMediaAccess=microphone`,
      openerTabId: 3,
      windowId: 9,
    });
    expect(browserTabsUpdateMock).not.toHaveBeenCalled();
  });

  it('does not reuse the source Settings tab or inherit its previous opener', async () => {
    browserTabsQueryMock.mockResolvedValueOnce([{ id: 7, windowId: 9, url: SETTINGS_PAGE_URL }]);
    browserTabsQueryMock.mockResolvedValueOnce([{ id: 7, windowId: 9, openerTabId: 3 }]);
    const { openSettingsPage } = await import('./index');
    await openSettingsPage({ requestMediaAccess: 'camera' });
    expect(browserTabsCreateMock).toHaveBeenCalledExactlyOnceWith({
      url: `${SETTINGS_PAGE_URL}?section=access-data&view=permissions&requestMediaAccess=camera`,
      windowId: 9,
      openerTabId: 7,
    });
    expect(browserTabsUpdateMock).not.toHaveBeenCalled();
  });

  it.each([
    ['microphone', 'chrome://settings/content/microphone'],
    ['camera', 'chrome://settings/content/camera'],
  ] as const)('opens the fixed %s browser permission settings', async (permission, url) => {
    const { openMediaPermissionSettingsPage } = await import('./index');
    await openMediaPermissionSettingsPage(permission);
    expect(browserTabsCreateMock).toHaveBeenCalledExactlyOnceWith({ url });
  });

  it('propagates browser permission settings navigation failure', async () => {
    const error = new Error('navigation unavailable');
    browserTabsCreateMock.mockRejectedValueOnce(error);
    const { openMediaPermissionSettingsPage } = await import('./index');
    await expect(openMediaPermissionSettingsPage('microphone')).rejects.toBe(error);
  });

  it.each(['microphone', 'camera'] as const)(
    'opens only this extension site details for blocked %s',
    async (permission) => {
      const { openMediaPermissionSettingsPage } = await import('./index');
      await openMediaPermissionSettingsPage(permission, 'extension');
      expect(browserTabsCreateMock).toHaveBeenCalledExactlyOnceWith({
        url: 'chrome://settings/content/siteDetails?site=chrome-extension%3A%2F%2Ftest%2F',
      });
    }
  );

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

    await openSettingsPage({ route: { section: 'native-app', view: 'commands' } });

    expect(browserTabsUpdateMock).toHaveBeenCalledWith(7, {
      active: true,
      url: 'chrome-extension://test/apps/extension/src/settings/index.html?section=native-app&view=commands',
    });
    expect(browserWindowsUpdateMock).toHaveBeenCalledWith(9, { focused: true });
    expect(browserTabsCreateMock).not.toHaveBeenCalled();
  });

  it('opens Chrome extension shortcut settings', async () => {
    const { openExtensionShortcutsPage } = await import('./index');

    await openExtensionShortcutsPage();

    expect(browserTabsCreateMock).toHaveBeenCalledWith({
      url: 'chrome://extensions/shortcuts',
    });
  });

  it('opens the current extension details page for browser-managed access', async () => {
    const { openExtensionDetailsPage } = await import('./index');

    await openExtensionDetailsPage();

    expect(runtimeGetUrlMock).toHaveBeenCalledWith('');
    expect(browserTabsCreateMock).toHaveBeenCalledWith({
      url: 'chrome://extensions/?id=test',
    });
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
  expect(isOwnedSettingsPage(`chrome-extension://other/${SETTINGS_PAGE_PATH}`)).toBe(false);
  expect(isOwnedSettingsPage(undefined)).toBe(false);
}

describe('returnToMediaRecordingPopup', () => {
  it('activates the original source before focusing and opening the actual popup', async () => {
    const operations: string[] = [];
    browserTabsQueryMock.mockResolvedValueOnce([
      { id: 7, windowId: 9, url: SETTINGS_PAGE_URL, openerTabId: 3 },
    ]);
    browserTabsGetMock.mockResolvedValueOnce({ id: 3, windowId: 9 });
    browserTabsUpdateMock.mockImplementationOnce(async () => {
      operations.push('source');
    });
    browserWindowsUpdateMock.mockImplementationOnce(async () => {
      operations.push('window');
    });
    browserActionOpenPopupMock.mockImplementationOnce(async () => {
      operations.push('popup');
    });
    const { returnToMediaRecordingPopup } = await import('./index');
    await expect(returnToMediaRecordingPopup()).resolves.toBe(true);
    expect(browserTabsQueryMock).toHaveBeenCalledExactlyOnceWith({
      active: true,
      currentWindow: true,
    });
    expect(browserTabsGetMock).toHaveBeenCalledExactlyOnceWith(3);
    expect(browserTabsUpdateMock).toHaveBeenCalledExactlyOnceWith(3, { active: true });
    expect(browserWindowsUpdateMock).toHaveBeenCalledExactlyOnceWith(9, { focused: true });
    expect(browserActionOpenPopupMock).toHaveBeenCalledExactlyOnceWith({ windowId: 9 });
    expect(browserActionGetPopupMock).toHaveBeenCalledExactlyOnceWith({ tabId: 3 });
    expect(browserActionSetPopupMock).toHaveBeenNthCalledWith(1, {
      tabId: 3,
      popup: `${POPUP_PAGE_URL}?recordingSetup=1`,
    });
    expect(browserActionSetPopupMock).toHaveBeenNthCalledWith(2, {
      tabId: 3,
      popup: POPUP_PAGE_URL,
    });
    expect(operations).toEqual(['source', 'window', 'popup']);
    expect(browserTabsCreateMock).not.toHaveBeenCalled();
  });

  it.each([
    { id: 7, windowId: 9, url: SETTINGS_PAGE_URL },
    { id: 7, windowId: 9, url: SETTINGS_PAGE_URL, openerTabId: 7 },
  ])('refuses an absent or invalid Settings source: %j', async (settingsTab) => {
    browserTabsQueryMock.mockResolvedValueOnce(settingsTab ? [settingsTab] : []);
    const { returnToMediaRecordingPopup } = await import('./index');
    await expect(returnToMediaRecordingPopup()).rejects.toThrow();
    expect(browserTabsUpdateMock).not.toHaveBeenCalled();
    expect(browserActionOpenPopupMock).not.toHaveBeenCalled();
  });

  it.each([
    undefined,
    { id: 7, windowId: 9, url: POPUP_PAGE_URL, openerTabId: 3 },
    { id: 7, windowId: 9, url: `chrome-extension://other/${SETTINGS_PAGE_PATH}`, openerTabId: 3 },
  ])('defers while the active page is not owned Settings: %j', async (settingsTab) => {
    browserTabsQueryMock.mockResolvedValueOnce(settingsTab ? [settingsTab] : []);
    const { returnToMediaRecordingPopup } = await import('./index');
    await expect(returnToMediaRecordingPopup()).resolves.toBe(false);
    expect(browserTabsUpdateMock).not.toHaveBeenCalled();
    expect(browserActionOpenPopupMock).not.toHaveBeenCalled();
  });

  it('refuses a source opener that has moved to another window', async () => {
    browserTabsQueryMock.mockResolvedValueOnce([
      { id: 7, windowId: 9, url: SETTINGS_PAGE_URL, openerTabId: 3 },
    ]);
    browserTabsGetMock.mockResolvedValueOnce({ id: 3, windowId: 10 });
    const { returnToMediaRecordingPopup } = await import('./index');
    await expect(returnToMediaRecordingPopup()).rejects.toThrow();
    expect(browserTabsUpdateMock).not.toHaveBeenCalled();
    expect(browserActionOpenPopupMock).not.toHaveBeenCalled();
  });

  it.each(['source missing', 'popup refused'])(
    'propagates %s without creating or replacing tabs',
    async (failure) => {
      browserTabsQueryMock.mockResolvedValueOnce([
        { id: 7, windowId: 9, url: SETTINGS_PAGE_URL, openerTabId: 3 },
      ]);
      const error = new Error(failure);
      if (failure === 'source missing') browserTabsGetMock.mockRejectedValueOnce(error);
      else {
        browserTabsGetMock.mockResolvedValueOnce({ id: 3, windowId: 9 });
        browserActionOpenPopupMock.mockRejectedValueOnce(error);
      }
      const { returnToMediaRecordingPopup } = await import('./index');
      await expect(returnToMediaRecordingPopup()).rejects.toBe(error);
      expect(browserTabsCreateMock).not.toHaveBeenCalled();
      if (failure === 'popup refused') {
        expect(browserActionSetPopupMock).toHaveBeenLastCalledWith({
          tabId: 3,
          popup: POPUP_PAGE_URL,
        });
        expect(browserActionSetPopupMock).toHaveBeenCalledTimes(2);
      }
    }
  );

  it.each(['read', 'override', 'restore'] as const)(
    'propagates a popup configuration %s failure',
    async (failure) => {
      browserTabsQueryMock.mockResolvedValueOnce([
        { id: 7, windowId: 9, url: SETTINGS_PAGE_URL, openerTabId: 3 },
      ]);
      browserTabsGetMock.mockResolvedValueOnce({ id: 3, windowId: 9 });
      const error = new Error(`configuration ${failure}`);
      if (failure === 'read') browserActionGetPopupMock.mockRejectedValueOnce(error);
      if (failure === 'override') browserActionSetPopupMock.mockRejectedValueOnce(error);
      if (failure === 'restore')
        browserActionSetPopupMock.mockResolvedValueOnce(undefined).mockRejectedValueOnce(error);
      const { returnToMediaRecordingPopup } = await import('./index');
      await expect(returnToMediaRecordingPopup()).rejects.toBe(error);
      if (failure !== 'restore') expect(browserActionOpenPopupMock).not.toHaveBeenCalled();
      expect(browserTabsCreateMock).not.toHaveBeenCalled();
    }
  );
});

describe('extension page editor helpers', () => {
  it('opens the image editor through the shared editor url helper', async () => {
    const { openImageEditorPage } = await import('./index');

    await openImageEditorPage();

    expect(browserTabsCreateMock).toHaveBeenCalledWith({
      url: 'chrome-extension://test/apps/extension/src/editor/index.html',
    });
  });
});

it('builds and opens gallery pages through runtime urls', async () => {
  const { openGalleryPage, openGalleryWebSnapshotsPage } = await import('./index');

  await openGalleryPage();
  await openGalleryPage({ folder: 'screenshot' });
  await openGalleryPage({ recordingId: 'recording-9' });
  await openGalleryPage({ recordingId: 'recording-draft', scope: 'temporary' });
  await openGalleryWebSnapshotsPage();

  expect(runtimeGetUrlMock).toHaveBeenNthCalledWith(1, 'apps/extension/src/gallery/index.html');
  expect(runtimeGetUrlMock).toHaveBeenNthCalledWith(2, 'apps/extension/src/gallery/index.html');
  expect(runtimeGetUrlMock).toHaveBeenNthCalledWith(3, 'apps/extension/src/gallery/index.html');
  expect(runtimeGetUrlMock).toHaveBeenNthCalledWith(4, 'apps/extension/src/gallery/index.html');
  expect(runtimeGetUrlMock).toHaveBeenNthCalledWith(5, 'apps/extension/src/gallery/index.html');
  expect(browserTabsCreateMock).toHaveBeenNthCalledWith(1, {
    url: 'chrome-extension://test/apps/extension/src/gallery/index.html',
  });
  expect(browserTabsCreateMock).toHaveBeenNthCalledWith(2, {
    url: 'chrome-extension://test/apps/extension/src/gallery/index.html?folder=screenshot',
  });
  expect(browserTabsCreateMock).toHaveBeenNthCalledWith(3, {
    url: 'chrome-extension://test/apps/extension/src/gallery/index.html?recordingId=recording-9',
  });
  expect(browserTabsCreateMock).toHaveBeenNthCalledWith(4, {
    url: 'chrome-extension://test/apps/extension/src/gallery/index.html?recordingId=recording-draft',
  });
  expect(browserTabsCreateMock).toHaveBeenNthCalledWith(5, {
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
});

it('builds a fixed local editor frame URL carrying only its embed session', async () => {
  const { buildScenarioImageEditorUrl } = await import('./index');
  const url = new URL(buildScenarioImageEditorUrl('session-123'));
  expect(url.protocol).toBe('chrome-extension:');
  expect(url.host).toBe('test');
  expect(url.pathname).toBe('/apps/extension/src/editor/index.html');
  expect([...url.searchParams]).toEqual([
    ['embed', 'scenario'],
    ['embedSession', 'session-123'],
  ]);
  expect(browserTabsCreateMock).not.toHaveBeenCalled();
});

it('scopes quick-edit intent to the requested recording route', async () => {
  const { openGalleryPage } = await import('./index');
  await openGalleryPage({ recordingId: 'rec&1', quickEdit: true });
  const url = new URL(browserTabsCreateMock.mock.calls.at(-1)![0].url);
  expect(url.searchParams.get('recordingId')).toBe('rec&1');
  expect(url.searchParams.get('mode')).toBe('edit');
  await openGalleryPage({ quickEdit: true });
  expect(browserTabsCreateMock).toHaveBeenLastCalledWith({
    url: `${EXTENSION_URL_ROOT}/gallery/index.html`,
  });
});

it('opens the selected saved Gallery review generation in the full editor', async () => {
  const { openVideoEditorPage } = await import('./index');
  await openVideoEditorPage(null, null, {
    aggregateId: 'recording:source-7',
    revision: 12,
    createdAt: 100,
    sourceAssetId: 'source-body-7',
  });
  expect(browserTabsCreateMock).toHaveBeenCalledWith({
    url:
      'chrome-extension://test/apps/extension/src/video-editor/index.html' +
      '?review=recording%3Asource-7&reviewRevision=12&reviewCreatedAt=100' +
      '&reviewSourceAssetId=source-body-7',
  });
});

it('opens the camera companion with teleprompter enabled', async () => {
  const { openCameraRecorderPage } = await import('./index');
  await openCameraRecorderPage({
    launchToken: 'token-1',
    recordingId: 'recording-1',
    teleprompter: true,
  });
  expect(browserWindowsCreateMock).toHaveBeenLastCalledWith(
    expect.objectContaining({
      url:
        'chrome-extension://test/apps/extension/src/camera-recorder/index.html?' +
        'recordingId=recording-1&launchToken=token-1&teleprompter=1',
    })
  );
});

it('rebinds an owned companion with a fragment and keeps its document URL', async () => {
  const { openCameraRecorderPage } = await import('./index');
  const base = 'chrome-extension://test/apps/extension/src/camera-recorder/index.html';
  browserTabsQueryMock.mockResolvedValueOnce([{ id: 20, windowId: 9, url: `${base}?draft=1` }]);
  await openCameraRecorderPage({
    launchToken: 'fresh-token',
    recordingId: 'rec-2',
    teleprompter: true,
  });
  expect(browserTabsUpdateMock).toHaveBeenCalledWith(20, {
    active: true,
    url: `${base}?draft=1#recordingId=rec-2&launchToken=fresh-token&teleprompter=1`,
  });
  expect(browserWindowsUpdateMock).toHaveBeenCalledWith(9, { focused: true });
  expect(browserWindowsCreateMock).not.toHaveBeenCalled();
});

it('opens a draft without recording tokens and returns an existing companion to its retained script', async () => {
  const { openTeleprompterPage } = await import('./index');
  await openTeleprompterPage();
  expect(browserWindowsCreateMock).toHaveBeenCalledWith(
    expect.objectContaining({
      url: 'chrome-extension://test/apps/extension/src/camera-recorder/index.html?teleprompter=1&draft=1',
    })
  );
  browserTabsQueryMock.mockResolvedValueOnce([
    {
      id: 21,
      windowId: 10,
      url: 'chrome-extension://test/apps/extension/src/camera-recorder/index.html',
    },
  ]);
  await openTeleprompterPage();
  expect(browserTabsUpdateMock).toHaveBeenCalledWith(21, {
    active: true,
    url: 'chrome-extension://test/apps/extension/src/camera-recorder/index.html#teleprompter=1&draft=1',
  });
});

it('does not send fresh recording tokens to a lookalike companion path', async () => {
  const { openCameraRecorderPage } = await import('./index');
  browserTabsQueryMock.mockResolvedValueOnce([
    { id: 22, url: 'chrome-extension://test/apps/extension/src/camera-recorder/index.html.evil' },
  ]);
  await openCameraRecorderPage({ launchToken: 'private-token', recordingId: 'rec-3' });
  expect(browserTabsUpdateMock).not.toHaveBeenCalled();
  expect(browserWindowsCreateMock).toHaveBeenCalledOnce();
});
