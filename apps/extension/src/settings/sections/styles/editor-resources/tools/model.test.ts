import { describe, expect, it } from 'vitest';
import { reorderToolPresetIds } from './model';
import { TOOL_PRESET_OWNERS } from './families';

describe('tool preset model', () => {
  it('does not duplicate border preset ownership', () => {
    expect(TOOL_PRESET_OWNERS).not.toContain('rectangle');
  });
  it('resolves reorder intent without mutating input', () => {
    const source = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    expect(reorderToolPresetIds(source, 'a', 'c')).toEqual(['b', 'c', 'a']);
    expect(source.map(({ id }) => id)).toEqual(['a', 'b', 'c']);
    expect(reorderToolPresetIds(source, 'a', 'a')).toBeNull();
  });
});
