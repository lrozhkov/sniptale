import { describe, expect, it } from 'vitest';
import { reorderToolPresetIdsBefore } from './model';
import { TOOL_PRESET_OWNERS } from './families';

describe('tool preset model', () => {
  it('does not duplicate border preset ownership', () => {
    expect(TOOL_PRESET_OWNERS).not.toContain('rectangle');
  });
  it('resolves reorder intent without mutating input', () => {
    const source = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    expect(reorderToolPresetIdsBefore(source, 'a', null)).toEqual(['b', 'c', 'a']);
    expect(source.map(({ id }) => id)).toEqual(['a', 'b', 'c']);
    expect(reorderToolPresetIdsBefore(source, 'missing', null)).toBeNull();
  });
});
