// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';

vi.mock('../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/i18n')>()),
  translate: (key: string) => key,
}));

import { consumeCameraRecorderRouteState } from './route-state';

beforeEach(() => {
  window.sessionStorage.clear();
  window.history.replaceState({}, '', '/apps/extension/src/camera-recorder/index.html');
  vi.spyOn(Date, 'now').mockReturnValue(1_000);
});

it('scrubs the launch URL without retaining recording identity in page storage', () => {
  window.history.replaceState(
    {},
    '',
    '/apps/extension/src/camera-recorder/index.html?recordingId=rec-1&launchToken=launch-1'
  );

  expect(consumeCameraRecorderRouteState()).toEqual({
    recordingId: 'rec-1',
    registrationToken: 'launch-1',
    routeError: null,
  });
  expect(window.location.search).toBe('');
  expect(window.sessionStorage.length).toBe(0);
});

it('uses a tokenless same-tab reconnect after a real page reload', () => {
  expect(consumeCameraRecorderRouteState()).toEqual({
    recordingId: null,
    registrationToken: null,
    routeError: null,
  });
  expect(window.sessionStorage.length).toBe(0);
});

it('rejects a partial launch identity after URL scrubbing', () => {
  window.history.replaceState(
    {},
    '',
    '/apps/extension/src/camera-recorder/index.html?recordingId=rec-1'
  );

  expect(consumeCameraRecorderRouteState()).toEqual({
    recordingId: null,
    registrationToken: null,
    routeError: 'popup.video.startRecordingError',
  });
  expect(window.location.search).toBe('');
  expect(window.sessionStorage.length).toBe(0);
});

it('consumes a new recording fragment before the previous query and scrubs both', () => {
  window.history.replaceState(
    {},
    '',
    '/apps/extension/src/camera-recorder/index.html?draft=1#recordingId=rec-2&launchToken=launch-2&teleprompter=1'
  );
  expect(consumeCameraRecorderRouteState()).toEqual({
    recordingId: 'rec-2',
    registrationToken: 'launch-2',
    routeError: null,
    teleprompter: true,
  });
  expect(window.location.search).toBe('');
  expect(window.location.hash).toBe('');
});

it('consumes a draft without recording identity or registration authority', () => {
  window.history.replaceState(
    {},
    '',
    '/apps/extension/src/camera-recorder/index.html?draft=1&teleprompter=1'
  );
  expect(consumeCameraRecorderRouteState()).toEqual({
    recordingId: null,
    registrationToken: null,
    routeError: null,
    teleprompter: true,
    draft: true,
  });
  expect(window.location.search).toBe('');
});
