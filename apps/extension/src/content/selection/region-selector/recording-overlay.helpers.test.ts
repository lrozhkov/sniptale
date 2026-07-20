// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getContentUiElementByIdMock: vi.fn((id: string) => document.getElementById(id)),
  resolveContentShadowRootMock: vi.fn(() => null),
  translateMock: vi.fn((key: string) => key),
}));

vi.mock('../../platform/dom-host', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/dom-host')>()),
  getContentUiElementById: mocks.getContentUiElementByIdMock,
  resolveContentShadowRoot: mocks.resolveContentShadowRootMock,
}));

vi.mock('../../../platform/i18n', () => ({
  translate: mocks.translateMock,
}));

import { buildRecordingOverlayNode } from './recording-overlay.helpers';

beforeEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
  vi.clearAllMocks();
});

it('builds the recording overlay node and injects the style once', () => {
  const host = document.createElement('div');
  host.appendChild(
    buildRecordingOverlayNode({
      cssHeight: 40,
      cssWidth: 30,
      cssX: 10,
      cssY: 20,
      indicatorTop: 8,
    })
  );

  expect(document.getElementById('sniptale-recording-overlay-style')).not.toBeNull();
  expect(host.children).toHaveLength(5);
  expect(host.textContent).toContain('content.overlayControls.regionRecordingLabel');
});

it('reuses the injected recording-overlay style on subsequent renders', () => {
  buildRecordingOverlayNode({
    cssHeight: 20,
    cssWidth: 20,
    cssX: 5,
    cssY: 5,
    indicatorTop: 4,
  });
  buildRecordingOverlayNode({
    cssHeight: 30,
    cssWidth: 25,
    cssX: 7,
    cssY: 9,
    indicatorTop: 6,
  });

  expect(document.querySelectorAll('#sniptale-recording-overlay-style')).toHaveLength(1);
});
