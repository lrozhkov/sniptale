// @vitest-environment jsdom

import { afterEach, expect, it, vi } from 'vitest';
import {
  CONTENT_UI_SCALE_PROPERTY,
  getContentUiPageZoomRevision,
  getContentUiScaleSnapshot,
  installContentUiScaleCompensation,
  readContentUiScaleCompensation,
  resolveContentUiScaleCompensation,
  setContentUiPageZoom,
  setContentUiPageZoomAtRevision,
  subscribeContentUiScale,
} from './ui-scale';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it.each([
  { current: 1.5, expected: 2 / 3 },
  { current: 1.8, expected: 5 / 9 },
  { current: 2, expected: 0.5 },
  { current: 5, expected: 0.2 },
])(
  'keeps chrome at its baseline size when page zoom changes to $current',
  ({ current, expected }) => {
    expect(
      resolveContentUiScaleCompensation({
        baselineDevicePixelRatio: 1,
        currentDevicePixelRatio: current,
      })
    ).toBeCloseTo(expected);
  }
);

it('combines page zoom and visual viewport scaling within safe bounds', () => {
  expect(
    resolveContentUiScaleCompensation({
      baselineDevicePixelRatio: 2,
      currentDevicePixelRatio: 4,
      visualViewportScale: 2,
    })
  ).toBe(0.25);
  expect(
    resolveContentUiScaleCompensation({
      baselineDevicePixelRatio: 1,
      currentDevicePixelRatio: 0.01,
    })
  ).toBe(4);
});

it('updates the host variable on resize and restores ownership on cleanup', () => {
  let devicePixelRatio = 1;
  vi.spyOn(window, 'devicePixelRatio', 'get').mockImplementation(() => devicePixelRatio);
  const host = document.createElement('div');
  document.body.append(host);
  const listener = vi.fn();
  const unsubscribe = subscribeContentUiScale(listener);

  const cleanup = installContentUiScaleCompensation(host);
  expect(host.style.getPropertyValue(CONTENT_UI_SCALE_PROPERTY)).toBe('1');

  devicePixelRatio = 2;
  window.dispatchEvent(new Event('resize'));
  expect(host.style.getPropertyValue(CONTENT_UI_SCALE_PROPERTY)).toBe('0.5');
  expect(getContentUiScaleSnapshot()).toBe(0.5);
  expect(listener).toHaveBeenCalledOnce();

  cleanup();
  expect(host.style.getPropertyValue(CONTENT_UI_SCALE_PROPERTY)).toBe('');
  expect(getContentUiScaleSnapshot()).toBe(1);
  unsubscribe();
});

it('compensates an exact page zoom that was already active when the content UI opened', () => {
  let devicePixelRatio = 3;
  vi.spyOn(window, 'devicePixelRatio', 'get').mockImplementation(() => devicePixelRatio);
  const host = document.createElement('div');
  document.body.append(host);

  const cleanup = installContentUiScaleCompensation(host);
  setContentUiPageZoom(2);
  expect(host.style.getPropertyValue(CONTENT_UI_SCALE_PROPERTY)).toBe('0.5');

  devicePixelRatio = 1.5;
  window.dispatchEvent(new Event('resize'));
  expect(host.style.getPropertyValue(CONTENT_UI_SCALE_PROPERTY)).toBe('1');
  cleanup();
});

it('does not let a stale bootstrap zoom overwrite a newer mode zoom', () => {
  let devicePixelRatio = 2;
  vi.spyOn(window, 'devicePixelRatio', 'get').mockImplementation(() => devicePixelRatio);
  const host = document.createElement('div');
  document.body.append(host);
  const cleanup = installContentUiScaleCompensation(host);
  const bootstrapRevision = getContentUiPageZoomRevision();

  setContentUiPageZoom(2);
  expect(setContentUiPageZoomAtRevision(1, bootstrapRevision)).toBe(false);
  expect(host.style.getPropertyValue(CONTENT_UI_SCALE_PROPERTY)).toBe('0.5');

  cleanup();
});

it('reads the inherited compensation used by visual placement owners', () => {
  const owner = document.createElement('div');
  owner.style.setProperty(CONTENT_UI_SCALE_PROPERTY, '0.625');
  const child = document.createElement('button');
  owner.append(child);
  document.body.append(owner);

  expect(readContentUiScaleCompensation(child)).toBe(0.625);
  expect(readContentUiScaleCompensation(null)).toBe(1);
});
