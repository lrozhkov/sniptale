import { describe, expect, it, vi } from 'vitest';

vi.mock('../heads-metrics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../heads-metrics')>()),
  buildExcalidrawArrowheadArmEnds: vi.fn(() => [
    { x: 0, y: 0 },
    { x: -12, y: 6 },
  ]),
}));

import { buildOpenArrowHeadPath } from './open';

describe('open arrow head builder owner', () => {
  it('skips degenerate chevron arms while preserving the remaining arm', () => {
    const path = buildOpenArrowHeadPath({ x: 20, y: 10 }, 0, 8);

    expect(path).toContain('M');
    expect(path).toContain('Q');
  });
});
