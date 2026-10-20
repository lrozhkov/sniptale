import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CaptureMode, VideoRecordingStatus } from '@sniptale/runtime-contracts/video/types/types';

const mocks = vi.hoisted(() => ({
  startup: vi.fn(),
  recording: vi.fn(),
  exportIntent: vi.fn(),
  clearLaunch: vi.fn(),
}));

vi.mock('../../platform/browser-driver', () => ({
  clearPopupVideoLaunchUrlParams: mocks.clearLaunch,
}));

vi.mock(
  '../../../composition/persistence/capture-settings/popup-startup',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../../composition/persistence/capture-settings/popup-startup')
    >()),
    DEFAULT_POPUP_STARTUP_STATE: { selection: 'remember-last', lastPage: 'menu' },
    loadPopupStartupState: mocks.startup,
  })
);
vi.mock('../bootstrap/recording-state', () => ({
  loadRecordingStateResponseWithFallback: mocks.recording,
  resolvePopupBootstrapRecordingState: (response: { state: unknown }) => ({
    recordingState: response.state,
    recordingStatusError: null,
  }),
}));
vi.mock('../bootstrap/runtime', () => ({
  popupBootstrapTransport: {},
  RuntimeMessagingTransport: undefined,
}));
vi.mock('../export/runtime/tab-message-routing', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../export/runtime/tab-message-routing')>()),
  consumePopupExportLaunchIntentForActiveTab: mocks.exportIntent,
}));

import { resolvePopupStartupRoute } from './coordinator';

beforeEach(() => {
  mocks.clearLaunch.mockClear();
  mocks.startup.mockResolvedValue({ selection: 'remember-last', lastPage: 'menu' });
  mocks.exportIntent.mockResolvedValue(null);
  mocks.recording.mockResolvedValue({
    state: { status: VideoRecordingStatus.IDLE },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it('returns to recording setup without selecting a capture mode or replacing startup preference', async () => {
  mocks.startup.mockResolvedValue({ selection: 'menu', lastPage: 'tools' });
  expect(
    await resolvePopupStartupRoute(
      'chrome-extension://test/apps/extension/src/popup/index.html?recordingSetup=1'
    )
  ).toEqual({
    page: 'video',
    recordingSnapshot: {
      controlCapability: null,
      state: { status: VideoRecordingStatus.IDLE },
      statusError: null,
    },
    postRecordSnapshot: { result: null },
  });
  expect(await resolvePopupStartupRoute()).toEqual({ page: 'menu' });
});

it('consumes a setup hint only from the current popup address', async () => {
  const href = 'chrome-extension://test/apps/extension/src/popup/index.html?recordingSetup=1';
  vi.stubGlobal('window', { location: { href } });
  await resolvePopupStartupRoute(href);
  expect(mocks.clearLaunch).toHaveBeenCalledExactlyOnceWith(href);
});

it.each([
  'recordingSetup=0',
  'recordingSetup=true',
  'recordingSetup=',
  'recordingSetup=1&recordingSetup=1',
])('ignores invalid or duplicate setup hints: %s', async (parameters) => {
  expect(
    await resolvePopupStartupRoute(
      `chrome-extension://test/apps/extension/src/popup/index.html?${parameters}`
    )
  ).toEqual({ page: 'menu' });
  expect(mocks.clearLaunch).not.toHaveBeenCalled();
});

it('keeps explicit video launch precedence when a recording setup hint is also present', async () => {
  expect(
    await resolvePopupStartupRoute(
      [
        'chrome-extension://test/apps/extension/src/popup/index.html',
        '?recordingSetup=1&videoLaunchMode=TAB&videoLaunchTabId=21',
      ].join('')
    )
  ).toMatchObject({
    page: 'video',
    videoMode: CaptureMode.TAB,
    videoLaunch: { tabId: 21, viewportPresetId: null },
  });
});

it('keeps active recording and post-record snapshots ahead of a setup hint', async () => {
  const href = 'chrome-extension://test/apps/extension/src/popup/index.html?recordingSetup=1';
  mocks.recording.mockResolvedValue({
    state: { status: VideoRecordingStatus.RECORDING },
    controlToken: 'token',
    recordingId: 'recording-1',
  });
  expect(await resolvePopupStartupRoute(href)).toMatchObject({
    page: 'video',
    recordingSnapshot: {
      controlCapability: { controlToken: 'token', recordingId: 'recording-1' },
      state: { status: VideoRecordingStatus.RECORDING },
    },
  });
  mocks.recording.mockResolvedValue({
    state: { status: VideoRecordingStatus.IDLE },
    postRecordResult: { recordingId: 'recording-1' },
  });
  expect(await resolvePopupStartupRoute(href)).toMatchObject({
    page: 'video',
    postRecordSnapshot: { result: { recordingId: 'recording-1' } },
  });
});

it('selects the requested video source without replacing persisted startup selection', async () => {
  mocks.startup.mockResolvedValue({ selection: 'tools', lastPage: 'menu' });
  expect(
    await resolvePopupStartupRoute(
      [
        'chrome-extension://test/apps/extension/src/popup/index.html',
        '?videoLaunchMode=TAB_CROP&videoLaunchTabId=21&videoLaunchPresetId=preset-alt',
      ].join('')
    )
  ).toMatchObject({
    page: 'video',
    videoMode: CaptureMode.TAB_CROP,
    videoLaunch: { tabId: 21, viewportPresetId: 'preset-alt' },
  });
  expect(await resolvePopupStartupRoute()).toEqual({ page: 'tools' });
});

it.each([
  'videoLaunchTabId=0',
  'videoLaunchTabId=-1',
  'videoLaunchTabId=1.5',
  'videoLaunchTabId=NaN',
  'videoLaunchTabId=9007199254740992',
  'videoLaunchTabId=21&videoLaunchMode=SCREEN',
])('rejects malformed video launch parameters: %s', async (parameters) => {
  expect(
    await resolvePopupStartupRoute(
      `chrome-extension://test/apps/extension/src/popup/index.html?videoLaunchMode=TAB&${parameters}`
    )
  ).toEqual({ page: 'menu' });
});

it('keeps recording and export precedence ahead of persisted startup', async () => {
  mocks.startup.mockResolvedValue({ selection: 'tools', lastPage: 'menu' });
  mocks.exportIntent.mockResolvedValue({ tabId: 7, startExport: false });
  mocks.recording.mockResolvedValue({ state: { status: VideoRecordingStatus.RECORDING } });
  expect(await resolvePopupStartupRoute()).toMatchObject({ page: 'video' });
});

it('restores fixed screenshot and video modes as route seeds', async () => {
  mocks.startup.mockResolvedValue({ selection: 'screenshots:desktop', lastPage: 'export' });
  expect(await resolvePopupStartupRoute()).toEqual({
    page: 'screenshots',
    screenshotMode: 'desktop',
  });
  mocks.startup.mockResolvedValue({ selection: 'video:camera', lastPage: 'menu' });
  expect(await resolvePopupStartupRoute()).toMatchObject({
    page: 'video',
    videoMode: CaptureMode.CAMERA,
    recordingSnapshot: {
      controlCapability: null,
      state: { status: VideoRecordingStatus.IDLE },
      statusError: null,
    },
  });
});

it('routes fixed screenshot actions to their new owning pages', async () => {
  mocks.startup.mockResolvedValue({ selection: 'screenshots:quick-actions', lastPage: 'video' });
  expect(await resolvePopupStartupRoute()).toEqual({
    page: 'screenshots',
    screenshotMode: 'quick-actions',
  });

  mocks.startup.mockResolvedValue({ selection: 'screenshots:tab', lastPage: 'video' });
  expect(await resolvePopupStartupRoute()).toEqual({ page: 'screenshots', screenshotMode: 'tab' });
});

it('routes the new top-level menu and tools startup destinations directly', async () => {
  mocks.startup.mockResolvedValue({ selection: 'menu', lastPage: 'video' });
  expect(await resolvePopupStartupRoute()).toEqual({ page: 'menu' });

  mocks.startup.mockResolvedValue({ selection: 'tools', lastPage: 'video' });
  expect(await resolvePopupStartupRoute()).toEqual({ page: 'tools' });
});

it('restores unified Export for both fixed and remember-last startup choices', async () => {
  mocks.startup.mockResolvedValue({ selection: 'export:download', lastPage: 'menu' });
  expect(await resolvePopupStartupRoute()).toEqual({ page: 'export', destination: 'export' });

  mocks.startup.mockResolvedValue({ selection: 'export:library', lastPage: 'menu' });
  expect(await resolvePopupStartupRoute()).toEqual({ page: 'export', destination: 'save' });

  mocks.startup.mockResolvedValue({
    selection: 'remember-last',
    lastPage: 'export',
    lastExportDestination: 'save',
  });
  expect(await resolvePopupStartupRoute()).toEqual({ page: 'export', destination: 'save' });
});

it.each([false, true])(
  'preserves export launch mode %s without overriding saved artifact preferences',
  async (startExport) => {
    mocks.startup.mockResolvedValue({ selection: 'export:library', lastPage: 'export' });
    mocks.exportIntent.mockResolvedValue({
      tabId: 7,
      startExport,
      ...(startExport ? { sourceDocumentId: 'document-7' } : {}),
    });
    expect(await resolvePopupStartupRoute()).toEqual({
      page: 'export',
      destination: 'export',
      launch: {
        tabId: 7,
        startExport,
        ...(startExport ? { sourceDocumentId: 'document-7' } : {}),
      },
    });
  }
);

it.each(['export:html', 'remember-last'] as const)(
  'opens HTML for %s without an export launch',
  async (selection) => {
    mocks.startup.mockResolvedValue({
      selection,
      lastPage: 'export',
      lastExportDestination: 'html',
    });
    expect(await resolvePopupStartupRoute()).toEqual({ page: 'export', destination: 'html' });
  }
);

it('retains active recording and explicit launch precedence over HTML startup', async () => {
  mocks.startup.mockResolvedValue({ selection: 'export:html', lastPage: 'export' });
  mocks.recording.mockResolvedValue({ state: { status: VideoRecordingStatus.RECORDING } });
  expect(await resolvePopupStartupRoute()).toMatchObject({ page: 'video' });
  mocks.recording.mockResolvedValue({ state: { status: VideoRecordingStatus.IDLE } });
  mocks.exportIntent.mockResolvedValue({ tabId: 7, startExport: false });
  expect(await resolvePopupStartupRoute()).toEqual({
    page: 'export',
    destination: 'export',
    launch: { tabId: 7, startExport: false },
  });
});
