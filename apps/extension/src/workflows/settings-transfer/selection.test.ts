import { describe, expect, it } from 'vitest';
import { buildExactRestoreDomainsBySelection, buildSettingsTransferPackage } from './package';
import { closeSettingsTransferSelection } from './selection';
import { buildSettingsTransferTree } from './tree';
import { SettingsTransferMissingDependencyError } from './tree';

describe('settings transfer selection', () => {
  it('keeps selected attachment limits in a selective package', () => {
    const tree = buildSettingsTransferTree();
    const built = buildSettingsTransferPackage({
      appVersion: '1.0.0',
      domains: {
        'capture.pages': {
          schemaVersion: 1,
          data: {
            resourceLimits: { maxFileCount: 50, maxFileSizeMiB: 20, maxTotalSizeMiB: 100 },
            timing: { loadTimeoutMs: 30_000, settleDelayMs: 2_000 },
          },
        },
      },
      exportKind: 'selective',
      selectedNodeIds: ['capture.pages.resourceLimits'],
      tree,
    });

    expect(built.package.domains['capture.pages']?.data).toEqual({
      resourceLimits: { maxFileCount: 50, maxFileSizeMiB: 20, maxTotalSizeMiB: 100 },
    });
  });

  it('adds an item dependency without selecting sibling items', () => {
    const tree = buildSettingsTransferTree([
      {
        collectionNodeId: 'capture.quick-actions.items',
        id: 'quick-a',
        label: 'Quick A',
        dependencies: ['capture.viewport-presets.items.viewport-a'],
      },
      {
        collectionNodeId: 'capture.quick-actions.items',
        id: 'quick-b',
        label: 'Quick B',
      },
      {
        collectionNodeId: 'capture.viewport-presets.items',
        id: 'viewport-a',
        label: 'Viewport A',
      },
      {
        collectionNodeId: 'capture.viewport-presets.items',
        id: 'viewport-b',
        label: 'Viewport B',
      },
    ]);
    const selected = closeSettingsTransferSelection(['capture.quick-actions.items.quick-a'], tree);
    expect(selected).toContain('capture.viewport-presets.items.viewport-a');
    expect(selected).not.toContain('capture.quick-actions.items.quick-b');
    expect(selected).not.toContain('capture.viewport-presets.items.viewport-b');
  });

  it('does not re-expand siblings from a derived collection ancestor', () => {
    const tree = buildSettingsTransferTree([
      { collectionNodeId: 'capture.viewport-presets.items', id: 'a', label: 'A' },
      { collectionNodeId: 'capture.viewport-presets.items', id: 'b', label: 'B' },
    ]);
    const closed = closeSettingsTransferSelection(
      ['capture.viewport-presets.items', 'capture.viewport-presets.items.a'],
      tree
    );
    expect(closed).toContain('capture.viewport-presets.items.a');
    expect(closed).not.toContain('capture.viewport-presets.items.b');
  });

  it('rejects a package with a dangling required item dependency', () => {
    expect(() =>
      buildSettingsTransferTree([
        {
          collectionNodeId: 'capture.quick-actions.items',
          id: 'quick-a',
          label: 'Quick A',
          dependencies: ['capture.viewport-presets.items.missing'],
        },
      ])
    ).toThrow(SettingsTransferMissingDependencyError);
  });

  it('filters prompt template order with the selected template', () => {
    const tree = buildSettingsTransferTree([
      { collectionNodeId: 'ai.prompt-templates.items', id: 'prompt-a', label: 'Prompt A' },
      { collectionNodeId: 'ai.prompt-templates.items', id: 'prompt-b', label: 'Prompt B' },
    ]);
    const built = buildSettingsTransferPackage({
      appVersion: '1.0.0',
      domains: {
        'ai.prompt-templates': {
          schemaVersion: 1,
          data: {
            items: [
              { id: 'prompt-a', name: 'Prompt A' },
              { id: 'prompt-b', name: 'Prompt B' },
            ],
            order: ['prompt-b', 'prompt-a'],
          },
        },
      },
      exportKind: 'selective',
      selectedNodeIds: ['ai.prompt-templates.items.prompt-a'],
      tree,
    });
    expect(built.package.domains['ai.prompt-templates']?.data).toEqual({
      items: [{ id: 'prompt-a', name: 'Prompt A' }],
      order: ['prompt-a'],
    });
  });

  it('exact restore preserves deselected fields and collection items', () => {
    const tree = buildSettingsTransferTree([
      { collectionNodeId: 'capture.viewport-presets.items', id: 'a', label: 'A' },
      { collectionNodeId: 'capture.viewport-presets.items', id: 'imported-only', label: 'New' },
    ]);
    const current = {
      'capture.image': { schemaVersion: 1, data: { format: 'png', quality: 100 } },
      'capture.viewport-presets': {
        schemaVersion: 1,
        data: {
          items: [
            { id: 'a', name: 'Local' },
            { id: 'local-only', name: 'Keep' },
          ],
        },
      },
    };
    const imported = {
      'capture.image': { schemaVersion: 1, data: { format: 'webp', quality: 80 } },
      'capture.viewport-presets': {
        schemaVersion: 1,
        data: {
          items: [
            { id: 'a', name: 'Imported' },
            { id: 'imported-only', name: 'New' },
          ],
        },
      },
    };
    expect(
      buildExactRestoreDomainsBySelection({
        current,
        imported,
        selectedNodeIds: ['capture.image.format', 'capture.viewport-presets.items.a'],
        tree,
      })
    ).toMatchObject({
      'capture.image': { data: { format: 'webp', quality: 100 } },
      'capture.viewport-presets': {
        data: {
          items: [
            { id: 'a', name: 'Imported' },
            { id: 'local-only', name: 'Keep' },
          ],
        },
      },
    });
  });

  it('exact restore removes local extras when the complete collection is selected', () => {
    const tree = buildSettingsTransferTree([
      { collectionNodeId: 'capture.viewport-presets.items', id: 'a', label: 'A' },
    ]);
    const result = buildExactRestoreDomainsBySelection({
      current: {
        'capture.viewport-presets': {
          schemaVersion: 1,
          data: { items: [{ id: 'local-only' }] },
        },
      },
      imported: {
        'capture.viewport-presets': { schemaVersion: 1, data: { items: [{ id: 'a' }] } },
      },
      selectedNodeIds: ['capture.viewport-presets.items'],
      tree,
    });
    expect(result['capture.viewport-presets']?.data).toEqual({ items: [{ id: 'a' }] });
  });
});
