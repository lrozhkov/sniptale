import { expect, it } from 'vitest';
import { isCompletedDrawSessionTooSmall } from './completion-size';

function createBoundedObject(width: number, height: number) {
  return {
    getBoundingRect: () => ({ height, width }),
  };
}

it('checks generic completed draw bounds and ignores missing objects', () => {
  expect(isCompletedDrawSessionTooSmall({ object: null } as never, 8)).toBe(false);
  expect(
    isCompletedDrawSessionTooSmall(
      { object: createBoundedObject(7, 20), tool: 'rectangle' } as never,
      8
    )
  ).toBe(true);
  expect(
    isCompletedDrawSessionTooSmall(
      { object: createBoundedObject(20, 20), tool: 'rectangle' } as never,
      8
    )
  ).toBe(false);
});
