// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { FrameManagerRefs } from '../contracts';
import { DEFAULT_BLUR_SETTINGS } from '../../../../features/highlighter/style/defaults';
import { useFrameManagerRefs } from './useFrameManagerRefs';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let firstRefs: FrameManagerRefs | null = null;
let secondRefs: FrameManagerRefs | null = null;

function Harness() {
  firstRefs = useFrameManagerRefs();
  secondRefs = useFrameManagerRefs();
  return null;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  firstRefs = null;
  secondRefs = null;
  vi.unstubAllGlobals();
});

it('creates independent tab-session settings refs from built-in fallbacks', async () => {
  await act(async () => root?.render(<Harness />));

  if (!firstRefs || !secondRefs) {
    throw new Error('Expected both frame-manager ref owners to render');
  }

  expect(firstRefs.sessionSettingsRefs.blurSettings.current).toEqual(DEFAULT_BLUR_SETTINGS);
  expect(firstRefs.sessionSettingsRefs.blurSettings.current).not.toBe(DEFAULT_BLUR_SETTINGS);
  expect(firstRefs.sessionSettingsRefs.defaultsInitialized.current).toBe(false);

  firstRefs.sessionSettingsRefs.blurSettings.current.amount = 99;
  firstRefs.sessionSettingsRefs.defaultsInitialized.current = true;

  expect(secondRefs.sessionSettingsRefs.blurSettings.current.amount).toBe(
    DEFAULT_BLUR_SETTINGS.amount
  );
  expect(secondRefs.sessionSettingsRefs.defaultsInitialized.current).toBe(false);
});
