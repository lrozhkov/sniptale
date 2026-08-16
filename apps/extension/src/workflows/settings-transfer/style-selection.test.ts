import { describe, expect, it } from 'vitest';
import {
  cloneSettingsTransferJsonValue,
  type SettingsTransferDomainPayload,
} from '../../contracts/settings-transfer';
import { SYSTEM_GRADIENT_PRESETS } from '../../composition/persistence/gradient-presets/defaults';
import { createSurfaceStylePresetCatalog } from '../../composition/persistence/surface-style-presets/catalog';
import { serializeSurfaceStylePresetCatalog } from '../../composition/persistence/surface-style-presets/parser';
import { parseSettingsTransferDomains } from './domain-parser';
import { buildSettingsTransferPackage } from './package';
import { buildSettingsTransferTree } from './tree';

describe('settings transfer style selection', () => {
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
          data: { slots: { 'slot-0': '#111111', 'slot-1': '#222222' } },
        },
      },
      exportKind: 'selective',
      selectedNodeIds: ['styles.palettes.items.slot-0'],
      tree,
    });
    expect(built.package.domains['styles.palettes']?.data).toEqual({
      slots: { 'slot-0': '#111111' },
    });
    expect(parseSettingsTransferDomains(built.package.domains)['styles.palettes']?.data).toEqual({
      slots: { 'slot-0': '#111111' },
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
