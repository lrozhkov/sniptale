import { describe, expect, it } from 'vitest';
import {
  cloneSettingsTransferJsonValue,
  type SettingsTransferDomainPayload,
} from '../../contracts/settings-transfer';
import { SYSTEM_GRADIENT_PRESETS } from '../../composition/persistence/gradient-presets/defaults';
import { createDefaultGradientPresetCatalog } from '../../composition/persistence/gradient-presets/defaults';
import { createSurfaceStylePresetCatalog } from '../../composition/persistence/surface-style-presets/catalog';
import { serializeSurfaceStylePresetCatalog } from '../../composition/persistence/surface-style-presets/parser';
import { parseSettingsTransferDomains } from './domain-parser';
import {
  buildSettingsTransferPackage,
  buildExactRestoreDomainsBySelection,
  filterSettingsTransferDomainsBySelection,
} from './package';
import { buildSettingsTransferTree } from './tree';
import { planSettingsTransfer } from './planner';
import { assertDurableSettingsTransferCatalogs } from './durable-catalogs';

describe('settings transfer style selection', () => {
  it('keeps a complete surface catalog valid during commit revalidation', () => {
    const domains = {
      'styles.surfaces': {
        schemaVersion: 1,
        data: cloneSettingsTransferJsonValue(
          serializeSurfaceStylePresetCatalog(createSurfaceStylePresetCatalog())
        ),
      },
    };

    const inspected = parseSettingsTransferDomains(domains);
    expect(() => parseSettingsTransferDomains(inspected)).not.toThrow();
    expect(parseSettingsTransferDomains(inspected)).toEqual(inspected);
  });

  it('exports one selected surface style instead of the whole collection', () => {
    const stored = serializeSurfaceStylePresetCatalog(createSurfaceStylePresetCatalog());
    const [first, second] = stored.presets;
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    const tree = buildSettingsTransferTree([
      { collectionNodeId: 'styles.surfaces.items', id: first!.id, label: first!.name },
      { collectionNodeId: 'styles.surfaces.items', id: second!.id, label: second!.name },
    ]);
    const domains: Record<string, SettingsTransferDomainPayload> = {
      'styles.surfaces': {
        schemaVersion: 1,
        data: cloneSettingsTransferJsonValue(stored),
      },
    };
    const built = buildSettingsTransferPackage({
      appVersion: '1.0.0',
      domains,
      exportKind: 'selective',
      selectedNodeIds: [`styles.surfaces.items.${first!.id}`],
      tree,
      now: new Date('2026-08-16T12:00:00.000Z'),
    });
    expect(built.package.domains['styles.surfaces']?.data).toEqual({ presets: [first] });
    expect(parseSettingsTransferDomains(built.package.domains)['styles.surfaces']?.data).toEqual({
      presets: [first],
    });
  });

  it('exports and parses one selected drawing palette slot', () => {
    const tree = buildSettingsTransferTree([
      { collectionNodeId: 'styles.palettes.items', id: 'slot-0', label: '#111111' },
      { collectionNodeId: 'styles.palettes.items', id: 'slot-1', label: '#222222' },
    ]);
    const built = buildSettingsTransferPackage({
      appVersion: '1.0.0',
      domains: {
        'styles.palettes': {
          schemaVersion: 1,
          data: {
            slots: { 'slot-0': '#111111', 'slot-1': '#222222' },
            names: { '#111111': 'Selected', '#222222': 'Excluded' },
          },
        },
      },
      exportKind: 'selective',
      selectedNodeIds: ['styles.palettes.items.slot-0'],
      tree,
    });
    expect(built.package.domains['styles.palettes']?.data).toEqual({
      slots: { 'slot-0': '#111111' },
      names: { '#111111': 'Selected' },
    });
    expect(parseSettingsTransferDomains(built.package.domains)['styles.palettes']?.data).toEqual({
      slots: { 'slot-0': '#111111' },
      names: { '#111111': 'Selected' },
    });
  });

  it('reconstructs partial style presets without undeclared fields', () => {
    const surface = serializeSurfaceStylePresetCatalog(createSurfaceStylePresetCatalog())
      .presets[0]!;
    const gradient = SYSTEM_GRADIENT_PRESETS[0]!;
    const parsed = parseSettingsTransferDomains({
      'styles.surfaces': {
        schemaVersion: 1,
        data: cloneSettingsTransferJsonValue({
          presets: [{ ...surface, authorization: 'surface-canary' }],
        }),
      },
      'styles.gradients': {
        schemaVersion: 1,
        data: cloneSettingsTransferJsonValue({
          presets: [{ ...gradient, authorization: 'gradient-canary' }],
        }),
      },
    });
    expect(JSON.stringify(parsed)).not.toContain('canary');
    expect(parsed['styles.surfaces']?.data).toEqual({ presets: [surface] });
    expect(parsed['styles.gradients']?.data).toEqual({ presets: [gradient] });
  });

  it('keeps only the selected tool preset family item', () => {
    const tree = buildSettingsTransferTree([
      { collectionNodeId: 'styles.tool-presets.items', id: 'step:step-a', label: 'Step A' },
      {
        collectionNodeId: 'styles.tool-presets.items',
        id: 'sceneBackground:scene-a',
        label: 'Scene A',
      },
    ]);
    const built = buildSettingsTransferPackage({
      appVersion: '1.0.0',
      domains: {
        'styles.tool-presets': {
          schemaVersion: 1,
          data: {
            step: { defaultPresetId: 'step-a', presets: [{ id: 'step-a', name: 'Step A' }] },
            sceneBackground: {
              defaultPresetId: 'scene-a',
              presets: [{ id: 'scene-a', name: 'Scene A' }],
            },
          },
        },
      },
      exportKind: 'selective',
      selectedNodeIds: ['styles.tool-presets.items.step:step-a'],
      tree,
    });
    expect(built.package.domains['styles.tool-presets']?.data).toEqual({
      step: { defaultPresetId: 'step-a', presets: [{ id: 'step-a', name: 'Step A' }] },
    });
  });
});

describe('settings transfer style catalog validation', () => {
  it.each([
    ['styles.surfaces', { defaultPresetIdBySurface: { unknown: 'preset-a' } }],
    [
      'styles.surfaces',
      { favoriteIdsBySurface: { 'highlighter-callout': ['preset-a', 'preset-a'] } },
    ],
    ['styles.gradients', { defaultPresetIdBySurface: { unknown: 'preset-a' } }],
    ['styles.gradients', { favoriteIdsBySurface: { 'highlighter-frame-fill': [42] } }],
  ])('rejects malformed partial %s defaults before import', (domainId, data) => {
    expect(() =>
      parseSettingsTransferDomains({
        [domainId]: { schemaVersion: 1, data: cloneSettingsTransferJsonValue(data) },
      })
    ).toThrow();
  });

  it.each([{ tags: null }, { activeFilterTagIds: null }, { schemaVersion: null }])(
    'rejects a present malformed tag field before restore: %j',
    (data) => {
      expect(() =>
        parseSettingsTransferDomains({
          'styles.tags': { schemaVersion: 1, data: cloneSettingsTransferJsonValue(data) },
        })
      ).toThrow();
    }
  );

  it('rejects a present malformed editor palette before import', () => {
    expect(() =>
      parseSettingsTransferDomains({
        'styles.tool-presets': { schemaVersion: 1, data: { palette: { sceneBackground: 42 } } },
      })
    ).toThrow();
  });

  it('applies selected serialized surface defaults to the normalized catalog', () => {
    const stored = serializeSurfaceStylePresetCatalog(createSurfaceStylePresetCatalog());
    const alternate = stored.presets.find(
      (preset) =>
        preset.enabled && preset.id !== stored.defaultPresetIdBySurface['highlighter-callout']
    );
    expect(alternate).toBeDefined();
    const current = parseSettingsTransferDomains({
      'styles.surfaces': { schemaVersion: 1, data: cloneSettingsTransferJsonValue(stored) },
    });
    const imported = parseSettingsTransferDomains({
      'styles.surfaces': {
        schemaVersion: 1,
        data: {
          defaultPresetIdBySurface: { 'highlighter-callout': alternate!.id },
          favoriteIdsBySurface: { 'highlighter-callout': [alternate!.id] },
        },
      },
    });
    const plan = planSettingsTransfer({ current, imported, strategy: 'safe-merge' });
    const merged = parseSettingsTransferDomains({
      'styles.surfaces': plan.domains['styles.surfaces']!,
    });
    expect(() => assertDurableSettingsTransferCatalogs(merged)).not.toThrow();
    expect(merged['styles.surfaces']?.data).toMatchObject({
      defaultPresetId: alternate!.id,
      favoriteIds: [alternate!.id],
    });
  });

  it.each([
    [
      'styles.gradients',
      {
        ...createDefaultGradientPresetCatalog(),
        favoriteIdsBySurface: { 'highlighter-frame-fill': ['missing'] },
      },
    ],
    [
      'styles.surfaces',
      {
        ...serializeSurfaceStylePresetCatalog(createSurfaceStylePresetCatalog()),
        favoriteIdsBySurface: { 'highlighter-callout': ['missing'] },
      },
    ],
  ])('rejects unknown favorites in a complete %s catalog', (domainId, data) => {
    expect(() =>
      parseSettingsTransferDomains({
        [domainId]: { schemaVersion: 1, data: cloneSettingsTransferJsonValue(data) },
      })
    ).toThrow();
  });

  it('accepts an owner-supported legacy gradient catalog without favorites', () => {
    expect(() =>
      parseSettingsTransferDomains({
        'styles.gradients': { schemaVersion: 1, data: { revision: 0, presets: [] } },
      })
    ).not.toThrow();
  });

  it.each([
    [
      'styles.gradients',
      {
        ...createDefaultGradientPresetCatalog(),
        favoriteIdsBySurface: { futureSurface: [SYSTEM_GRADIENT_PRESETS[0]!.id] },
      },
    ],
    [
      'styles.gradients',
      {
        ...createDefaultGradientPresetCatalog(),
        defaultPresetIdBySurface: {
          'highlighter-frame-fill': SYSTEM_GRADIENT_PRESETS[0]!.id,
          futureSurface: SYSTEM_GRADIENT_PRESETS[0]!.id,
        },
      },
    ],
    [
      'styles.surfaces',
      {
        ...serializeSurfaceStylePresetCatalog(createSurfaceStylePresetCatalog()),
        favoriteIdsBySurface: { futureSurface: [] },
      },
    ],
    [
      'styles.surfaces',
      {
        ...serializeSurfaceStylePresetCatalog(createSurfaceStylePresetCatalog()),
        defaultPresetIdBySurface: {
          ...serializeSurfaceStylePresetCatalog(createSurfaceStylePresetCatalog())
            .defaultPresetIdBySurface,
          futureSurface: 'system-surface-plain',
        },
      },
    ],
  ])('rejects unknown surfaces in a complete %s catalog', (domainId, data) => {
    expect(() =>
      parseSettingsTransferDomains({
        [domainId]: { schemaVersion: 1, data: cloneSettingsTransferJsonValue(data) },
      })
    ).toThrow();
  });
});

it('refuses malformed optional palette names at the import boundary', () => {
  expect(() =>
    parseSettingsTransferDomains({
      'styles.palettes': {
        schemaVersion: 1,
        data: { slots: { 'slot-0': '#111111' }, names: { '#111111': 'x'.repeat(81) } },
      },
    })
  ).toThrow();
});

describe('named palette restore selection', () => {
  const slots = Object.fromEntries(
    Array.from({ length: 10 }, (_, index) => [`slot-${index}`, index === 0 ? '#111111' : '#222222'])
  );
  const tree = buildSettingsTransferTree(
    Object.keys(slots).map((id) => ({ collectionNodeId: 'styles.palettes.items', id, label: id }))
  );
  const current: Record<string, SettingsTransferDomainPayload> = {
    'styles.palettes': {
      schemaVersion: 1,
      data: {
        slots,
        names: { '#111111': 'Local selected', '#663399': 'Local scene', '#999999': 'Local extra' },
      },
    },
  };
  it.each([undefined, { '#663399': 'Imported scene', '#445566': 'Imported unused' }])(
    'restores the complete RGB map, including deletion and scene-only metadata: %s',
    (names) => {
      const imported: Record<string, SettingsTransferDomainPayload> = {
        'styles.palettes': { schemaVersion: 1, data: { slots, ...(names ? { names } : {}) } },
      };
      const projected = buildExactRestoreDomainsBySelection({
        current,
        imported,
        selectedNodeIds: ['styles.palettes'],
        tree,
      });
      const plan = planSettingsTransfer({
        current,
        imported: projected,
        strategy: 'exact-restore',
      });
      expect(plan.domains['styles.palettes']?.data).toEqual({ slots, ...(names ? { names } : {}) });
      expect(parseSettingsTransferDomains(plan.domains)).toEqual(plan.domains);
      const selected = filterSettingsTransferDomainsBySelection({
        domains: imported,
        selectedNodeIds: ['styles.palettes'],
        tree,
      });
      const merged = planSettingsTransfer({
        current,
        imported: selected,
        strategy: 'overwrite-matching',
      });
      if (names) expect(merged.domains['styles.palettes']?.data).toMatchObject({ names });
    }
  );
  it('clears an unnamed selected RGB during partial exact restore and retains deselected metadata', () => {
    const imported: Record<string, SettingsTransferDomainPayload> = {
      'styles.palettes': {
        schemaVersion: 1,
        data: { slots, names: { '#663399': 'Unselected imported scene' } },
      },
    };
    const projected = buildExactRestoreDomainsBySelection({
      current,
      imported,
      selectedNodeIds: ['styles.palettes.items.slot-0'],
      tree,
    });
    const plan = planSettingsTransfer({ current, imported: projected, strategy: 'exact-restore' });
    expect(plan.domains['styles.palettes']?.data).toEqual({
      slots,
      names: { '#663399': 'Local scene', '#999999': 'Local extra' },
    });
  });
  it('restores a selected name without changing other RGB identities', () => {
    const imported: Record<string, SettingsTransferDomainPayload> = {
      'styles.palettes': {
        schemaVersion: 1,
        data: {
          slots: { ...slots, 'slot-0': '#333333' },
          names: { '#333333': 'New color', '#663399': 'Unselected imported scene' },
        },
      },
    };
    const projected = buildExactRestoreDomainsBySelection({
      current,
      imported,
      selectedNodeIds: ['styles.palettes.items.slot-0'],
      tree,
    });
    expect(projected['styles.palettes']?.data).toEqual({
      slots: { ...slots, 'slot-0': '#333333' },
      names: {
        '#111111': 'Local selected',
        '#663399': 'Local scene',
        '#999999': 'Local extra',
        '#333333': 'New color',
      },
    });
  });
});
