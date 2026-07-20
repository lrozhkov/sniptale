import { afterEach, describe, expect, it, vi } from 'vitest';
import { createScenarioMutationMetadata, getScenarioMutationTimestamp } from './timestamps';

describe('scenario editor project mutation timestamps', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates stable mutation metadata from the current owner timestamp', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-20T12:34:56.000Z'));

    const timestamp = getScenarioMutationTimestamp();

    expect(timestamp).toBe(Date.parse('2026-06-20T12:34:56.000Z'));
    expect(createScenarioMutationMetadata()).toEqual({
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  });
});
