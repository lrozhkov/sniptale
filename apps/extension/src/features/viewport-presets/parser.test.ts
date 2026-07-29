import { describe, expect, it } from 'vitest';
import { createSystemViewportPresetCatalog } from './catalog';
import { parseViewportPresetCatalog } from './parser';

describe('viewport preset catalog parser', () => {
  it('accepts the complete current catalog atomically', () => {
    const catalog = createSystemViewportPresetCatalog();
    expect(parseViewportPresetCatalog(catalog)).toEqual(catalog);
  });

  it('adds the Full HD viewport while preserving revision-1 customizations and user presets', () => {
    const legacyCatalog = createSystemViewportPresetCatalog()
      .filter((preset) => preset.id !== 'system:viewport-full-hd')
      .map((preset) => ({ ...preset, catalogRevision: 1 }));
    const viewportHdIndex = legacyCatalog.findIndex((preset) => preset.id === 'system:viewport-hd');
    const viewportHd = legacyCatalog[viewportHdIndex];
    if (viewportHd?.kind !== 'system') throw new Error('Expected the legacy HD viewport');
    legacyCatalog[viewportHdIndex] = {
      ...viewportHd,
      customized: true,
      width: 1279,
    };
    const legacy = [
      ...legacyCatalog.slice(0, 5),
      {
        kind: 'user' as const,
        id: 'user-wide',
        name: 'Wide',
        target: 'viewport' as const,
        width: 1600,
        height: 900,
        enabled: true,
        order: 5,
      },
      ...legacyCatalog.slice(5),
    ];

    const parsed = parseViewportPresetCatalog(legacy);

    expect(parsed).toHaveLength(11);
    expect(parsed).toContainEqual(
      expect.objectContaining({
        catalogRevision: 2,
        height: 1080,
        id: 'system:viewport-full-hd',
        target: 'viewport',
        width: 1920,
      })
    );
    expect(parsed).toContainEqual(
      expect.objectContaining({ id: 'system:viewport-hd', customized: true, width: 1279 })
    );
    expect(parsed).toContainEqual(expect.objectContaining({ id: 'user-wide', name: 'Wide' }));
  });

  it('rejects a revision-1 catalog whose user preset collides with the new system ID', () => {
    const legacyCatalog = createSystemViewportPresetCatalog()
      .filter((preset) => preset.id !== 'system:viewport-full-hd')
      .map((preset) => ({ ...preset, catalogRevision: 1 }));
    const collidingUserPreset = {
      kind: 'user' as const,
      id: 'system:viewport-full-hd',
      name: 'Collision',
      target: 'viewport' as const,
      width: 1920,
      height: 1080,
      enabled: true,
      order: 5,
    };

    expect(
      parseViewportPresetCatalog([
        ...legacyCatalog.slice(0, 5),
        collidingUserPreset,
        ...legacyCatalog.slice(5),
      ])
    ).toBeUndefined();
  });

  it.each([
    {
      label: 'legacy partial catalog',
      mutate: () => [
        {
          kind: 'user',
          id: 'legacy',
          name: 'Legacy',
          target: 'viewport',
          width: 1280,
          height: 720,
          enabled: true,
          order: 0,
        },
      ],
    },
    {
      label: 'duplicate ID',
      mutate: () => {
        const catalog = createSystemViewportPresetCatalog();
        catalog[1] = { ...catalog[1]!, id: catalog[0]!.id };
        return catalog;
      },
    },
    {
      label: 'bad catalog revision',
      mutate: () => {
        const catalog: unknown[] = [...createSystemViewportPresetCatalog()];
        catalog[0] = { ...createSystemViewportPresetCatalog()[0]!, catalogRevision: 3 };
        return catalog;
      },
    },
    {
      label: 'bad dimensions',
      mutate: () => {
        const catalog = createSystemViewportPresetCatalog();
        catalog[0] = { ...catalog[0]!, width: 0 };
        return catalog;
      },
    },
    {
      label: 'non-normalized group order',
      mutate: () => {
        const catalog = createSystemViewportPresetCatalog();
        return [catalog[5]!, ...catalog.slice(0, 5), ...catalog.slice(6)];
      },
    },
  ])('rejects the whole $label', ({ mutate }) => {
    expect(parseViewportPresetCatalog(mutate())).toBeUndefined();
  });

  it('rejects contradictory customized state and accepts the explicit customization', () => {
    const invalid = createSystemViewportPresetCatalog();
    invalid[0] = { ...invalid[0]!, width: 400 };
    expect(parseViewportPresetCatalog(invalid)).toBeUndefined();

    const valid = createSystemViewportPresetCatalog();
    const first = valid[0];
    if (first?.kind !== 'system') throw new Error('Expected a system preset');
    valid[0] = { ...first, customized: true, width: 400 };
    expect(parseViewportPresetCatalog(valid)?.[0]).toMatchObject({ customized: true, width: 400 });
  });
});
