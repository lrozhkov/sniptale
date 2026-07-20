import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSourceObjectMock: vi.fn(),
}));

vi.mock('../document/layers', () => ({
  getSourceObject: mocks.getSourceObjectMock,
}));

import { readCurrentBrowserFrameSourceState } from './source-state';

beforeEach(() => {
  vi.clearAllMocks();
});

it('returns fallback source state when the canvas has no source object', () => {
  const fallback = { id: 'fallback-source', displayWidth: 320, displayHeight: 180 };
  mocks.getSourceObjectMock.mockReturnValue(undefined);

  expect(readCurrentBrowserFrameSourceState({} as never, fallback as never)).toBe(fallback);
  expect(readCurrentBrowserFrameSourceState({} as never, null)).toBeNull();
});

it('projects the current canvas source object into browser-frame source state', () => {
  mocks.getSourceObjectMock.mockReturnValue({
    getScaledHeight: vi.fn(() => 180),
    getScaledWidth: vi.fn(() => 320),
    left: 24,
    sniptaleId: 'source-image-1',
    sniptaleLocked: true,
    top: 98,
    visible: false,
  });

  expect(
    readCurrentBrowserFrameSourceState(
      {} as never,
      {
        dataUrl: 'data:image/png;base64,fallback',
        id: 'fallback',
        intrinsicHeight: 720,
        intrinsicWidth: 1280,
        name: 'Fallback',
      } as never
    )
  ).toMatchObject({
    id: 'source-image-1',
    dataUrl: 'data:image/png;base64,fallback',
    intrinsicWidth: 1280,
    intrinsicHeight: 720,
    displayWidth: 320,
    displayHeight: 180,
    left: 24,
    top: 98,
    visible: false,
    locked: true,
  });
});

it('uses canvas source defaults when fallback metadata is absent', () => {
  mocks.getSourceObjectMock.mockReturnValue({
    getScaledHeight: vi.fn(() => 240),
    getScaledWidth: vi.fn(() => 426),
  });

  expect(readCurrentBrowserFrameSourceState({} as never, null)).toMatchObject({
    id: 'source-image-layer',
    dataUrl: '',
    name: null,
    intrinsicWidth: 426,
    intrinsicHeight: 240,
    displayWidth: 426,
    displayHeight: 240,
    left: 0,
    top: 0,
    visible: true,
    locked: false,
  });
});
