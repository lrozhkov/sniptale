// @vitest-environment jsdom

import { expect, it } from 'vitest';
import { clearPopupVideoLaunchUrlParams } from './index';

it('removes only consumed video launch parameters and preserves history state', () => {
  window.history.replaceState(
    { marker: 'kept' },
    '',
    [
      '/popup/index.html?keep=1&videoLaunchMode=TAB&videoLaunchTabId=12',
      '&videoLaunchPresetId=preset-1&recordingSetup=1#kept',
    ].join('')
  );
  clearPopupVideoLaunchUrlParams(window.location.href);
  expect(window.location.pathname + window.location.search + window.location.hash).toBe(
    '/popup/index.html?keep=1#kept'
  );
  expect(window.history.state).toEqual({ marker: 'kept' });
});

it('consumes the recording setup hint without changing unrelated URL state', () => {
  window.history.replaceState(
    { marker: 'kept' },
    '',
    '/popup/index.html?recordingSetup=1&keep=1#kept'
  );
  clearPopupVideoLaunchUrlParams(window.location.href);
  expect(window.location.pathname + window.location.search + window.location.hash).toBe(
    '/popup/index.html?keep=1#kept'
  );
  expect(window.history.state).toEqual({ marker: 'kept' });
});

it('does not clear parameters from an address that changed after parsing', () => {
  window.history.replaceState({}, '', '/popup/index.html?videoLaunchMode=TAB&videoLaunchTabId=12');
  const oldHref = window.location.href;
  window.history.replaceState(
    {},
    '',
    '/popup/index.html?videoLaunchMode=SCREEN&videoLaunchTabId=13'
  );
  const currentHref = window.location.href;
  clearPopupVideoLaunchUrlParams(oldHref);
  expect(window.location.href).toBe(currentHref);
});
