import { describe, expect, it } from 'vitest';
import { planSettingsTransfer } from './planner';
import { parseSettingsTransferDomains } from './domain-parser';

describe('settings transfer planner', () => {
  it('safe-merge copies a conflicting identity and remaps references', () => {
    const plan = planSettingsTransfer({
      current: {
        'capture.viewport-presets': {
          schemaVersion: 1,
          data: { items: [{ id: 'viewport-a', name: 'Local' }] },
        },
        'capture.quick-actions': {
          schemaVersion: 1,
          data: { items: [] },
        },
      },
      imported: {
        'capture.viewport-presets': {
          schemaVersion: 1,
          data: { items: [{ id: 'viewport-a', name: 'Imported' }] },
        },
        'capture.quick-actions': {
          schemaVersion: 1,
          data: { items: [{ id: 'quick-a', viewportPresetId: 'viewport-a' }] },
        },
      },
      strategy: 'safe-merge',
    });
    expect(plan.summary.copiedRemapped).toBe(1);
    expect(plan.domains['capture.viewport-presets']?.data).toEqual({
      items: [
        { id: 'viewport-a', name: 'Local' },
        { id: 'viewport-a-imported', name: 'Imported' },
      ],
    });
    expect(plan.domains['capture.quick-actions']?.data).toEqual({
      items: [{ id: 'quick-a', viewportPresetId: 'viewport-a-imported' }],
    });
  });

  it('copies strict AI models without injecting style catalog fields', () => {
    const plan = planSettingsTransfer({
      current: {
        'ai.models': {
          schemaVersion: 1,
          data: {
            items: [
              {
                id: 'model-a',
                providerId: 'provider-a',
                modelCode: 'local',
                displayName: 'Local',
              },
            ],
            defaultModelId: null,
          },
        },
      },
      imported: {
        'ai.models': {
          schemaVersion: 1,
          data: {
            items: [
              {
                id: 'model-a',
                providerId: 'provider-a',
                modelCode: 'imported',
                displayName: 'Imported',
              },
            ],
            defaultModelId: null,
          },
        },
      },
      strategy: 'safe-merge',
    });
    const parsed = parseSettingsTransferDomains({ 'ai.models': plan.domains['ai.models']! });
    expect(parsed['ai.models']?.data).toEqual({
      items: [
        {
          id: 'model-a',
          providerId: 'provider-a',
          modelCode: 'local',
          displayName: 'Local',
        },
        {
          id: 'model-a-imported',
          providerId: 'provider-a',
          modelCode: 'imported',
          displayName: 'Imported',
        },
      ],
      defaultModelId: null,
    });
  });

  it('keeps delimiter-bearing item decisions bound to their exact conflict', () => {
    const plan = planSettingsTransfer({
      current: {
        'ai.prompt-templates': {
          schemaVersion: 1,
          data: {
            items: [
              { id: 'x', content: 'local-x' },
              { id: 'a.x', content: 'local-dotted' },
            ],
            order: ['x', 'a.x'],
          },
        },
      },
      imported: {
        'ai.prompt-templates': {
          schemaVersion: 1,
          data: {
            items: [
              { id: 'x', content: 'imported-x' },
              { id: 'a.x', content: 'imported-dotted' },
            ],
            order: ['x', 'a.x'],
          },
        },
      },
      strategy: 'overwrite-matching',
      decisions: {
        'ai.prompt-templates.items.x': 'use-imported',
        'ai.prompt-templates.items.a.x': 'keep-local',
      },
    });

    expect(plan.conflicts.map(({ id, nodeId }) => ({ id, nodeId }))).toEqual([
      {
        id: 'ai.prompt-templates.items.x',
        nodeId: 'ai.prompt-templates.items.x',
      },
      {
        id: 'ai.prompt-templates.items.a.x',
        nodeId: 'ai.prompt-templates.items.a.x',
      },
    ]);
    expect(plan.domains['ai.prompt-templates']?.data).toMatchObject({
      items: [
        { id: 'x', content: 'imported-x' },
        { id: 'a.x', content: 'local-dotted' },
      ],
    });
  });

  it('exact restore replaces a selected domain exactly', () => {
    const plan = planSettingsTransfer({
      current: { 'capture.image': { schemaVersion: 1, data: { format: 'png', quality: 100 } } },
      imported: { 'capture.image': { schemaVersion: 1, data: { format: 'webp', quality: 80 } } },
      strategy: 'exact-restore',
    });
    expect(plan.domains['capture.image']?.data).toEqual({ format: 'webp', quality: 80 });
  });

  it('namespaces copy remaps and never rewrites unrelated local references', () => {
    const plan = planSettingsTransfer({
      current: {
        'capture.viewport-presets': {
          schemaVersion: 1,
          data: { items: [{ id: 'shared', name: 'Local viewport' }], defaultId: 'shared' },
        },
        'ai.providers': {
          schemaVersion: 1,
          data: { items: [{ id: 'shared', name: 'Local provider' }] },
        },
        'ai.models': {
          schemaVersion: 1,
          data: { items: [{ id: 'local-model', providerId: 'shared' }] },
        },
      },
      imported: {
        'capture.viewport-presets': {
          schemaVersion: 1,
          data: { items: [{ id: 'shared', name: 'Imported viewport' }], defaultId: 'shared' },
        },
        'ai.providers': {
          schemaVersion: 1,
          data: { items: [{ id: 'shared', name: 'Imported provider' }] },
        },
        'ai.models': {
          schemaVersion: 1,
          data: { items: [{ id: 'imported-model', providerId: 'shared' }] },
        },
      },
      strategy: 'safe-merge',
    });
    expect(plan.domains['capture.viewport-presets']?.data).toMatchObject({
      defaultId: 'shared-imported',
    });
    expect(plan.domains['ai.models']?.data).toEqual({
      items: [
        { id: 'local-model', providerId: 'shared' },
        { id: 'imported-model', providerId: 'shared-imported' },
      ],
    });
  });
});
