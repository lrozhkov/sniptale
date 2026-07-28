import { describe, expect, it } from 'vitest';
import { createSystemViewportPresetCatalog } from './catalog';
import { parseViewportPresetCatalog } from './parser';

describe('viewport preset catalog parser', () => {
  it('accepts the complete revision-1 catalog atomically', () => {
    const catalog = createSystemViewportPresetCatalog();
    expect(parseViewportPresetCatalog(catalog)).toEqual(catalog);
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
        catalog[0] = { ...createSystemViewportPresetCatalog()[0]!, catalogRevision: 2 };
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
