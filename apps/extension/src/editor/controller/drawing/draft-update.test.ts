import { Point } from 'fabric';
import { expect, it } from 'vitest';
import { updateEditorDrawSessionObject } from './draft-update';

it('returns null when a draw session has no active draft object', () => {
  expect(
    updateEditorDrawSessionObject(
      { object: null, tool: 'rectangle' } as never,
      new Point(10, 10),
      {} as never,
      {} as never,
      {} as never
    )
  ).toBeNull();
});
