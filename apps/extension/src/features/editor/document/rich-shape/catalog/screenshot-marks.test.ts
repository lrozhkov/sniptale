import { describe, expect, it } from 'vitest';
import { getEditorBuiltInShapeEntry, searchEditorBuiltInShapes } from './index';
import { SCREENSHOT_MARK_ENTRIES } from './entries-screenshot-marks';
import { isEditorKnownRichShapeKind, resolveEditorRichShapeFamily } from './families';

describe('screenshot mark presets', () => {
  it('offers eight cursors and four stamps in searchable categories', () => {
    expect(SCREENSHOT_MARK_ENTRIES.filter((entry) => entry.category === 'cursors')).toHaveLength(8);
    expect(SCREENSHOT_MARK_ENTRIES.filter((entry) => entry.category === 'stamps')).toHaveLength(4);
    expect(searchEditorBuiltInShapes('hand').map((entry) => entry.id)).toContain('cursor-hand');
    expect(searchEditorBuiltInShapes('штамп').map((entry) => entry.id)).toContain('stamp-warning');
    expect(getEditorBuiltInShapeEntry('cursor-unknown')).toBeUndefined();
  });

  it.each(SCREENSHOT_MARK_ENTRIES)('resolves $id with non-text preset defaults', (entry) => {
    expect(getEditorBuiltInShapeEntry(entry.id)).toBe(entry);
    expect(isEditorKnownRichShapeKind(entry.id)).toBe(true);
    expect(resolveEditorRichShapeFamily(entry.id)).toBe(entry.insertDefaults.shapeFamily);
    expect(entry.capabilities).not.toContain('text');
    expect(entry.insertDefaults.frame).toMatchObject({ width: 48, height: 48 });
    expect(entry.insertDefaults.style.lineWidth).toBe(3);
    expect(entry.geometry.type).toBe('path');
  });
});
