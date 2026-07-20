// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { clearCameraRecorderLaunchUrlParams } from '.';

afterEach(() => {
  vi.restoreAllMocks();
});

it('clears one-shot camera recorder launch params from the current URL', () => {
  window.history.replaceState(
    {},
    '',
    '/apps/extension/src/camera-recorder/index.html?recordingId=rec-1&launchToken=token-1'
  );
  const replaceStateSpy = vi.spyOn(window.history, 'replaceState');

  clearCameraRecorderLaunchUrlParams();

  expect(replaceStateSpy).toHaveBeenCalledWith(
    {},
    '',
    '/apps/extension/src/camera-recorder/index.html'
  );
});
