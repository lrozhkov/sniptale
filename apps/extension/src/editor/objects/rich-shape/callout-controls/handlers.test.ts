// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { Group, Rect } from 'fabric';

import { createCalloutActionHandler, createCalloutPositionHandler } from './handlers';

function createGroup() {
  const group = new Group([new Rect({ height: 20, width: 20 })], {
    height: 100,
    width: 160,
  }) as any;
  group.sniptaleType = 'rich-shape';
  group.sniptaleRichShape = {
    callout: {
      body: { height: 60, left: 20, top: 10, width: 100 },
      tail: {
        baseEndRatio: 0.75,
        baseStartRatio: 0.25,
        side: 'bottom',
        tip: { x: 80, y: 120 },
      },
    },
    frame: { height: 140, width: 160 },
    style: { cornerRadius: 8 },
  };
  return group;
}

it('positions callout handles and applies tail updates', () => {
  const group = createGroup();
  const update = vi.fn(() => true);

  const position = createCalloutPositionHandler('tip')(
    {} as never,
    {} as never,
    group,
    {} as never
  );
  const updated = createCalloutActionHandler('tip', update)(
    vi.fn() as never,
    { target: group } as never,
    100,
    50
  );

  expect(position.x).toBeTypeOf('number');
  expect(updated).toBe(true);
  expect(update).toHaveBeenCalledWith(
    group,
    expect.objectContaining({
      callout: expect.objectContaining({
        tail: expect.objectContaining({ tip: expect.any(Object) }),
      }),
    })
  );
});

it('ignores invalid callout control targets', () => {
  expect(
    createCalloutPositionHandler('tip')({} as never, {} as never, {} as never, {} as never)
  ).toMatchObject({
    x: 0,
    y: 0,
  });
  expect(
    createCalloutActionHandler('tip', vi.fn())(vi.fn() as never, { target: {} } as never, 0, 0)
  ).toBe(false);
});
