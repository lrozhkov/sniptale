import { expect, it, vi } from 'vitest';

vi.mock('fabric', () => ({
  Path: class Path {},
}));

import { Path } from 'fabric';
import { isLineObject } from './identity';

it('recognizes fabric path line objects only', () => {
  const line = new (Path as unknown as new () => Path)() as Path & { sniptaleType?: string };
  line.sniptaleType = 'line';

  expect(isLineObject(line as never)).toBe(true);
  expect(isLineObject({ sniptaleType: 'line' } as never)).toBe(false);
});
