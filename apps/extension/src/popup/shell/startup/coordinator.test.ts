import { beforeEach, expect, it, vi } from 'vitest';
import { CaptureMode, VideoRecordingStatus } from '@sniptale/runtime-contracts/video/types/types';

const mocks = vi.hoisted(() => ({
  startup: vi.fn(),
  recording: vi.fn(),
  exportIntent: vi.fn(),
}));

vi.mock(
  '../../../composition/persistence/capture-settings/popup-startup',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../../composition/persistence/capture-settings/popup-startup')
    >()),
    DEFAULT_POPUP_STARTUP_STATE: { selection: 'remember-last', lastPage: 'home' },
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
  mocks.startup.mockResolvedValue({ selection: 'remember-last', lastPage: 'home' });
  mocks.exportIntent.mockResolvedValue(null);
  mocks.recording.mockResolvedValue({
    state: { status: VideoRecordingStatus.IDLE },
  });
});

it('keeps recording and export precedence ahead of persisted startup', async () => {
  mocks.startup.mockResolvedValue({ selection: 'screenshots:tools', lastPage: 'home' });
  mocks.exportIntent.mockResolvedValue('export');
  mocks.recording.mockResolvedValue({ state: { status: VideoRecordingStatus.RECORDING } });
  expect(await resolvePopupStartupRoute()).toMatchObject({ page: 'video' });
});

it('restores fixed screenshot and video modes as route seeds', async () => {
  mocks.startup.mockResolvedValue({ selection: 'screenshots:tools', lastPage: 'export' });
  expect(await resolvePopupStartupRoute()).toEqual({ page: 'home', screenshotMode: 'tools' });
  mocks.startup.mockResolvedValue({ selection: 'video:camera', lastPage: 'home' });
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
