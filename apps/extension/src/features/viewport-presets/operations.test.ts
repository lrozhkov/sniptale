import { describe, expect, it } from 'vitest';
import { createSystemViewportPresetCatalog } from './catalog';
import {
  createUserViewportPreset,
  normalizeViewportPresetOrder,
  orderViewportPresetsForSelector,
  resetSystemViewportPreset,
} from './operations';
import { parseViewportPresetCatalog } from './parser';

describe('viewport preset operations', () => {
  it('projects browser-window presets before page-viewport presets for selectors', () => {
    const ordered = orderViewportPresetsForSelector(createSystemViewportPresetCatalog());

    expect(ordered.map((preset) => preset.target)).toEqual([
      'window',
      'window',
      'window',
      'window',
      'viewport',
      'viewport',
      'viewport',
      'viewport',
      'viewport',
      'viewport',
    ]);
  });

  it('groups targets and normalizes order', () => {
    const catalog = createSystemViewportPresetCatalog();
    const normalized = normalizeViewportPresetOrder([catalog[6]!, catalog[0]!]);
    expect(normalized.map((preset) => [preset.target, preset.order])).toEqual([
      ['viewport', 0],
      ['window', 0],
    ]);
  });

  it('creates trimmed user presets and resets system presets', () => {
    const user = createUserViewportPreset({
      id: 'user-1',
      name: '  Test  ',
      target: 'window',
      width: 1200,
      height: 800,
      order: 9,
    });
    expect(user.name).toBe('Test');

    const catalog = createSystemViewportPresetCatalog();
    const source = catalog[0]!;
    if (source.kind !== 'system') throw new Error('Expected a system preset');
    const edited = {
      ...source,
      customized: true,
      enabled: false,
      width: 400,
    };
    const reset = resetSystemViewportPreset([edited, ...catalog.slice(1), user], edited);
    expect(reset[0]).toEqual(catalog[0]);
  });

  it('persists target-relative order without customizing untouched window presets', () => {
    const catalog = createSystemViewportPresetCatalog();
    const user = createUserViewportPreset({
      id: 'user-viewport',
      name: 'Custom viewport',
      target: 'viewport',
      width: 900,
      height: 700,
      order: 5,
    });
    const normalized = normalizeViewportPresetOrder([...catalog, user]);

    expect(parseViewportPresetCatalog(normalized)).toEqual(normalized);
    expect(
      normalized.flatMap((preset) =>
        preset.target === 'window' && preset.kind === 'system'
          ? [[preset.order, preset.customized]]
          : []
      )
    ).toEqual([
      [0, false],
      [1, false],
      [2, false],
      [3, false],
    ]);

    const firstWindow = normalized.find(
      (preset) => preset.kind === 'system' && preset.systemKey === 'windowHd'
    );
    if (!firstWindow || firstWindow.kind !== 'system') {
      throw new Error('Expected the HD window preset');
    }
    const reset = resetSystemViewportPreset(normalized, { ...firstWindow, customized: true });
    expect(reset.find((preset) => preset.id === firstWindow.id)).toMatchObject({
      customized: false,
      order: 0,
      target: 'window',
    });
  });
});
