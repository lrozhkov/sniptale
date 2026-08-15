import { describe, expect, it } from 'vitest';
import {
  createSystemViewportPresetCatalog,
  getCanonicalSystemViewportPreset,
  getSystemViewportPresetKeys,
} from './catalog';

describe('window-size preset catalog', () => {
  it('contains only the four canonical browser-window sizes', () => {
    const catalog = createSystemViewportPresetCatalog();
    expect(catalog.map(({ id, target, order }) => ({ id, target, order }))).toEqual([
      { id: 'system:window-hd', target: 'window', order: 0 },
      { id: 'system:window-laptop', target: 'window', order: 1 },
      { id: 'system:window-desktop', target: 'window', order: 2 },
      { id: 'system:window-full-hd', target: 'window', order: 3 },
    ]);
    expect(getSystemViewportPresetKeys()).toEqual([
      'windowHd',
      'windowLaptop',
      'windowDesktop',
      'windowFullHd',
    ]);
  });

  it('returns clones and rejects removed viewport keys', () => {
    const first = getCanonicalSystemViewportPreset('windowHd');
    first.width = 1;
    expect(getCanonicalSystemViewportPreset('windowHd').width).toBe(1280);
    expect(() =>
      Reflect.apply(getCanonicalSystemViewportPreset, undefined, ['viewportHd'])
    ).toThrow('Unknown system viewport preset');
  });
});
