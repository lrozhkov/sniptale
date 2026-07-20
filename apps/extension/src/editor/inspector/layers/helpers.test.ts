import { describe, expect, it } from 'vitest';
import {
  canDeleteLayerSelection,
  canDuplicateLayerSelection,
  canMergeLayerSelection,
  canReorderLayerSelection,
  getLayerActionTitle,
} from './helpers';

describe('editor layers sidebar helpers', () => {
  it('adds the disabled reason only when a selection action is unavailable', () => {
    expect(getLayerActionTitle({ enabled: true, label: 'Raise' })).toBe('Raise');
    expect(getLayerActionTitle({ enabled: false, label: 'Raise' })).toContain('Raise');
  });
});

describe('editor layers sidebar selection capabilities', () => {
  it('resolves reorder, merge, duplicate, and delete capabilities from the current selection', () => {
    const regularLayer = {
      id: 'layer-1',
      immutable: false,
      locked: false,
      selected: true,
      type: 'rectangle',
    };
    const sourceLayer = {
      id: 'source-image',
      immutable: true,
      locked: false,
      selected: true,
      type: 'source-image',
    };
    const immutableLayer = {
      id: 'locked',
      immutable: true,
      locked: false,
      selected: true,
      type: 'rectangle',
    };
    const lockedLayer = {
      id: 'layer-locked',
      immutable: false,
      locked: true,
      selected: true,
      type: 'rectangle',
    };

    expect(canReorderLayerSelection([])).toBe(false);
    expect(canReorderLayerSelection([regularLayer] as never)).toBe(true);
    expect(canMergeLayerSelection([regularLayer] as never)).toBe(false);
    expect(canMergeLayerSelection([regularLayer, sourceLayer] as never)).toBe(true);
    expect(canDuplicateLayerSelection([regularLayer] as never)).toBe(true);
    expect(canDuplicateLayerSelection([sourceLayer] as never)).toBe(true);
    expect(canDuplicateLayerSelection([immutableLayer] as never)).toBe(false);
    expect(canDeleteLayerSelection([regularLayer] as never)).toBe(true);
    expect(canDeleteLayerSelection([sourceLayer] as never)).toBe(false);
    expect(canReorderLayerSelection([lockedLayer] as never)).toBe(false);
    expect(canMergeLayerSelection([regularLayer, lockedLayer] as never)).toBe(false);
    expect(canDuplicateLayerSelection([lockedLayer] as never)).toBe(false);
    expect(canDeleteLayerSelection([lockedLayer] as never)).toBe(false);
  });
});
