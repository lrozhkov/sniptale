import { describe, expect, it } from 'vitest';
import { settingsModalFieldSurfaceClassName } from './classes';

describe('viewport preset editor surface classes', () => {
  it('owns the modal field surface class locally', () => {
    expect(settingsModalFieldSurfaceClassName).toBe('sniptale-modal-field-surface');
  });
});
