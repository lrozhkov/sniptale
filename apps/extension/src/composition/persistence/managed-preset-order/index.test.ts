import { describe, expect, it, vi } from 'vitest';
import { hasUniqueSequentialPresetOrder, restoreManagedPresetOrder } from './index';

type Preset = {
  customized: boolean;
  id: string;
  order: number;
  origin: 'system' | 'user';
};

const preset = (id: string, order: number, origin: Preset['origin'] = 'system'): Preset => ({
  customized: false,
  id,
  order,
  origin,
});

describe('managed preset order', () => {
  it('requires unique ids and a contiguous zero-based order', () => {
    expect(hasUniqueSequentialPresetOrder([preset('one', 0), preset('two', 1)])).toBe(true);
    expect(hasUniqueSequentialPresetOrder([preset('one', 0), preset('one', 1)])).toBe(false);
    expect(hasUniqueSequentialPresetOrder([preset('one', 0), preset('two', 2)])).toBe(false);
  });

  it('restores pending user and customized presets beside surviving system anchors', () => {
    const copyPending = vi.fn((value: Preset) => ({ ...value }));
    const customized = { ...preset('customized', 1), customized: true };
    const result = restoreManagedPresetOrder({
      copyPending,
      customizedIds: new Set(['customized']),
      previous: [preset('removed', 0), customized, preset('user', 2, 'user'), preset('anchor', 3)],
      refreshed: [preset('new', 0), preset('anchor', 1)],
    });

    expect(result.map((value) => value.id)).toEqual(['customized', 'user', 'new', 'anchor']);
    expect(copyPending).toHaveBeenCalledTimes(2);
  });
});
