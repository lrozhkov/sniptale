import { expect, it, vi } from 'vitest';

import { clampTechnicalDataTextPosition } from './positioning';

it('keeps technical data text inside the source bounds', () => {
  const text = {
    getScaledHeight: () => 40,
    getScaledWidth: () => 80,
    set: vi.fn(),
  };

  clampTechnicalDataTextPosition(
    text as never,
    {
      displayHeight: 100,
      displayWidth: 120,
      left: 10,
      top: 20,
    } as never
  );

  expect(text.set).toHaveBeenCalledWith({ left: 30, top: 60 });
});
