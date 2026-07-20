import { Point } from 'fabric';
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  readArrowPointsMock: vi.fn(() => [
    { x: 5, y: 6 },
    { x: 5, y: 6 },
  ]),
  isArrowObjectMock: vi.fn(() => true),
  updateArrowObjectMock: vi.fn(),
}));

vi.mock('../../objects/arrow/controls', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../objects/arrow/controls')>()),
  readArrowPoints: mocks.readArrowPointsMock,
}));

vi.mock('../../objects/arrow', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../objects/arrow')>()),
  isArrowObject: mocks.isArrowObjectMock,
  updateArrowObject: mocks.updateArrowObjectMock,
}));

import { updateEditorDrawSessionObject } from './';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.readArrowPointsMock.mockReturnValue([
    { x: 5, y: 6 },
    { x: 5, y: 6 },
  ]);
  mocks.isArrowObjectMock.mockReturnValue(true);
});

it('updates drag arrows through the shared point route', () => {
  const arrow = { sniptaleType: 'arrow' };

  expect(
    updateEditorDrawSessionObject(
      { object: arrow, start: { x: 5, y: 6 }, tool: 'arrow' } as never,
      new Point(20, 30),
      { color: '#fff', width: 4 } as never,
      {} as never,
      {} as never
    )
  ).toBeNull();

  expect(arrow).toMatchObject({ sniptaleArrowPointerMoved: true });
  expect(mocks.updateArrowObjectMock).toHaveBeenCalledWith(arrow, {
    points: [
      { x: 5, y: 6 },
      { x: 20, y: 30 },
    ],
    settings: { color: '#fff', width: 4 },
  });
});

it('ignores arrow draw sessions when the object is no longer an arrow', () => {
  mocks.isArrowObjectMock.mockReturnValue(false);

  expect(
    updateEditorDrawSessionObject(
      { object: { sniptaleType: 'rectangle' }, start: { x: 5, y: 6 }, tool: 'arrow' } as never,
      new Point(20, 30),
      { color: '#fff', width: 4 } as never,
      {} as never,
      {} as never
    )
  ).toBeNull();

  expect(mocks.updateArrowObjectMock).not.toHaveBeenCalled();
});

it('keeps fixed click-route points while moving the preview endpoint', () => {
  const arrow = {
    sniptaleArrowClickMode: true,
    sniptaleArrowPointerMoved: false,
    sniptaleType: 'arrow',
  };
  mocks.readArrowPointsMock.mockReturnValue([
    { x: 0, y: 0 },
    { x: 30, y: 0 },
    { x: 30, y: 0 },
  ]);

  updateEditorDrawSessionObject(
    { object: arrow, start: { x: 30, y: 0 }, tool: 'arrow' } as never,
    new Point(40, 20),
    { color: '#fff', width: 4 } as never,
    {} as never,
    {} as never
  );

  expect(mocks.updateArrowObjectMock).toHaveBeenCalledWith(arrow, {
    points: [
      { x: 0, y: 0 },
      { x: 30, y: 0 },
      { x: 40, y: 20 },
    ],
    settings: { color: '#fff', width: 4 },
  });
});

it('uses raw arrow draft points instead of normalized elbow route points while previewing', () => {
  const arrow = {
    sniptaleArrowClickMode: true,
    sniptaleArrowDraftPoints: [
      { x: 0, y: 0 },
      { x: 30, y: 20 },
      { x: 30, y: 20 },
    ],
    sniptaleArrowPointerMoved: false,
    sniptaleType: 'arrow',
  };
  mocks.readArrowPointsMock.mockReturnValue([
    { x: 0, y: 0 },
    { x: 15, y: 0 },
    { x: 15, y: 20 },
    { x: 30, y: 20 },
    { x: 30, y: 20 },
  ]);

  updateEditorDrawSessionObject(
    { object: arrow, start: { x: 30, y: 20 }, tool: 'arrow' } as never,
    new Point(60, 40),
    { arrowType: 'elbow', color: '#fff', mode: 'straight', width: 4 } as never,
    {} as never,
    {} as never
  );

  expect(arrow.sniptaleArrowDraftPoints).toEqual([
    { x: 0, y: 0 },
    { x: 30, y: 20 },
    { x: 60, y: 40 },
  ]);
  expect(mocks.updateArrowObjectMock).toHaveBeenCalledWith(arrow, {
    points: [
      { x: 0, y: 0 },
      { x: 30, y: 20 },
      { x: 60, y: 40 },
    ],
    settings: { arrowType: 'elbow', color: '#fff', mode: 'straight', width: 4 },
  });
});

it('falls back to the session start when arrow metadata has no points yet', () => {
  const arrow = { sniptaleType: 'arrow' };
  mocks.readArrowPointsMock.mockReturnValue([]);

  updateEditorDrawSessionObject(
    { object: arrow, start: { x: 7, y: 8 }, tool: 'arrow' } as never,
    new Point(10, 12),
    { color: '#fff', width: 4 } as never,
    {} as never,
    {} as never
  );

  expect(mocks.updateArrowObjectMock).toHaveBeenCalledWith(arrow, {
    points: [
      { x: 7, y: 8 },
      { x: 10, y: 12 },
    ],
    settings: { color: '#fff', width: 4 },
  });
});
