import { beforeEach, expect, it, vi } from 'vitest';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';

const mocks = vi.hoisted(() => ({
  loadPopupStartupState: vi.fn(),
}));

vi.mock(
  '../../../composition/persistence/capture-settings/popup-startup',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../../composition/persistence/capture-settings/popup-startup')
    >()),
    loadPopupStartupState: mocks.loadPopupStartupState,
  })
);
import { applyPopupStartupSelection, loadPopupStartupSelection } from './startup-routing';

function createParams() {
  return {
    navigateToPage: vi.fn(async () => 'unchanged' as const),
    setScreenshotStartupMode: vi.fn(),
    setVideoCaptureMode: vi.fn(),
  } satisfies Parameters<typeof applyPopupStartupSelection>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
});

it('restores the last top-level page in remember mode', async () => {
  const params = createParams();
  await applyPopupStartupSelection(params, 'remember-last', 'video');
  expect(params.navigateToPage).toHaveBeenCalledWith('video', 'startup');
  expect(params.setVideoCaptureMode).not.toHaveBeenCalled();
});

it.each([
  ['video:tab', CaptureMode.TAB],
  ['video:area', CaptureMode.TAB_CROP],
  ['video:camera', CaptureMode.CAMERA],
  ['video:screen', CaptureMode.SCREEN],
] as const)('opens a fixed video mode for %s', async (selection, captureMode) => {
  const params = createParams();
  await applyPopupStartupSelection(params, selection, 'home');
  expect(params.setVideoCaptureMode).toHaveBeenCalledWith(captureMode);
  expect(params.navigateToPage).toHaveBeenCalledWith('video', 'startup');
});

it('publishes a fixed screenshot submode without overwriting remembered state', async () => {
  const params = createParams();
  await applyPopupStartupSelection(params, 'screenshots:tools', 'video');
  expect(params.setScreenshotStartupMode).toHaveBeenCalledWith('tools');
  expect(params.navigateToPage).toHaveBeenCalledWith('home', 'startup');
});

it('falls back to remember-last defaults when startup storage is unavailable', async () => {
  mocks.loadPopupStartupState.mockRejectedValueOnce(new Error('unavailable'));
  await expect(loadPopupStartupSelection()).resolves.toEqual({
    selection: 'remember-last',
    lastPage: 'home',
  });
});
