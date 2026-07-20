import { describe, expect, it } from 'vitest';
import { getTimelineActionTitle } from './helpers';

describe('project timeline toolbar helpers', () => {
  it('adds the selection-required suffix only when the action is disabled', () => {
    expect(getTimelineActionTitle({ disabled: false, label: 'Split' })).toBe('Split');
    expect(getTimelineActionTitle({ disabled: true, label: 'Split' })).toContain('Split');
  });
});
