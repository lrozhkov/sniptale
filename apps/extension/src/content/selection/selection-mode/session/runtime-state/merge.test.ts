import { describe, expect, it } from 'vitest';

import { mergeSelectionModeRuntimeState } from './merge';

describe('mergeSelectionModeRuntimeState', () => {
  it('preserves accessor descriptors when merging proxy slices', () => {
    let backingValue = 1;
    const slice = {};

    Object.defineProperties(slice, {
      liveValue: {
        get() {
          return backingValue;
        },
        set(value: number) {
          backingValue = value;
        },
        enumerable: true,
        configurable: true,
      },
    });

    const state = mergeSelectionModeRuntimeState(slice) as unknown as {
      liveValue: number;
    };
    const descriptor = Object.getOwnPropertyDescriptor(state, 'liveValue');

    expect(descriptor?.get).toEqual(expect.any(Function));
    expect(descriptor?.set).toEqual(expect.any(Function));
    expect(state.liveValue).toBe(1);
    state.liveValue = 9;
    expect(backingValue).toBe(9);
  });

  it('merges distinct slice properties onto a single state object', () => {
    const state = mergeSelectionModeRuntimeState({ alpha: 1 }, { beta: 2 }, { gamma: 3 });

    expect(state).toMatchObject({ alpha: 1, beta: 2, gamma: 3 });
  });
});
