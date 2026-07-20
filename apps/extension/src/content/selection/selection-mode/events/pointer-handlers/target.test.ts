// @vitest-environment jsdom

import { afterEach, expect, it, vi } from 'vitest';

const targetMocks = vi.hoisted(() => ({
  getContentEventTargetElementMock: vi.fn(),
  resolveIframeEventTargetMock: vi.fn(),
}));

vi.mock('../../../../platform/dom-host', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/dom-host')>()),
  getContentEventTargetElement: targetMocks.getContentEventTargetElementMock,
}));

vi.mock('../../../../platform/frame', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/frame')>()),
  resolveIframeEventTarget: targetMocks.resolveIframeEventTargetMock,
}));

import { resolveSelectionModePointerTarget } from './target';

afterEach(() => {
  vi.clearAllMocks();
});

it('prefers the iframe target when one is resolved', () => {
  const iframe = document.createElement('iframe');
  const target = document.createElement('div');
  targetMocks.resolveIframeEventTargetMock.mockReturnValue(target);

  expect(resolveSelectionModePointerTarget(new MouseEvent('mousemove'), iframe)).toBe(target);
  expect(targetMocks.resolveIframeEventTargetMock).toHaveBeenCalledWith(
    expect.any(MouseEvent),
    iframe
  );
  expect(targetMocks.getContentEventTargetElementMock).not.toHaveBeenCalled();
});

it('falls back to the content event target when no iframe target is resolved', () => {
  const target = document.createElement('section');
  targetMocks.resolveIframeEventTargetMock.mockReturnValue(null);
  targetMocks.getContentEventTargetElementMock.mockReturnValue(target);

  expect(resolveSelectionModePointerTarget(new MouseEvent('mousemove'))).toBe(target);
  expect(targetMocks.getContentEventTargetElementMock).toHaveBeenCalledWith(expect.any(MouseEvent));
});

it('uses the linked preview image when the event target is the wrapping anchor', () => {
  const anchor = document.createElement('a');
  const image = document.createElement('img');
  anchor.appendChild(image);
  image.getBoundingClientRect = () =>
    ({
      bottom: 235,
      height: 135,
      left: 50,
      right: 300,
      top: 100,
      width: 250,
      x: 50,
      y: 100,
      toJSON: () => ({}),
    }) as DOMRect;
  targetMocks.resolveIframeEventTargetMock.mockReturnValue(anchor);

  expect(
    resolveSelectionModePointerTarget(
      new MouseEvent('click', { clientX: 70, clientY: 120, bubbles: true })
    )
  ).toBe(image);
});
