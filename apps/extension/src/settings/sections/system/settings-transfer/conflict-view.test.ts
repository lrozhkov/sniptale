import { expect, it, vi } from 'vitest';
import type {
  SettingsTransferConflict,
  SettingsTransferTreeNode,
} from '../../../../contracts/settings-transfer';

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));
import { buildVisibleSettingsTransferConflicts } from './conflict-view';

it('maps storage conflict paths to selected tree items and user-facing labels', () => {
  const item = node('styles.surfaces.items.system-surface-plain', 'styles.surfaces.items', 'Plain');
  const collection = {
    ...node('styles.surfaces.items', 'styles.surfaces', 'Items'),
    children: [item],
  };
  const tree = [{ ...node('styles.surfaces', null, 'Surface styles'), children: [collection] }];
  const conflict = makeConflict(
    'styles.surfaces.presets.system-surface-plain',
    'styles.surfaces.items.system-surface-plain'
  );

  expect(
    buildVisibleSettingsTransferConflicts({
      conflicts: [conflict],
      selected: new Set([item.id]),
      tree,
    })
  ).toEqual([{ conflict, label: 'Plain', transferNodeId: item.id }]);
  expect(
    buildVisibleSettingsTransferConflicts({ conflicts: [conflict], selected: new Set(), tree })
  ).toEqual([]);
});

it('maps scalar camel-case storage fields to canonical transfer fields', () => {
  const field = node('interface.preferences.popup-startup', 'interface.preferences', 'Popup page');
  const tree = [
    {
      ...node('interface.preferences', null, 'Interface'),
      kind: 'scalar' as const,
      children: [field],
    },
  ];
  const conflict = makeConflict(
    'interface.preferences.popupStartup',
    'interface.preferences.popup-startup'
  );

  expect(
    buildVisibleSettingsTransferConflicts({
      conflicts: [conflict],
      selected: new Set([field.id]),
      tree,
    })
  ).toEqual([{ conflict, label: 'Popup page', transferNodeId: field.id }]);
});

it('binds delimiter-bearing item IDs to the exact selected conflict', () => {
  const short = node('ai.prompt-templates.items.x', 'ai.prompt-templates.items', 'Short');
  const dotted = node('ai.prompt-templates.items.a.x', 'ai.prompt-templates.items', 'Dotted');
  const collection = {
    ...node('ai.prompt-templates.items', 'ai.prompt-templates', 'Items'),
    children: [short, dotted],
  };
  const tree = [
    {
      ...node('ai.prompt-templates', null, 'Prompt templates'),
      children: [collection],
    },
  ];
  const shortConflict = makeConflict('ai.prompt-templates.items.x', 'ai.prompt-templates.items.x');
  const dottedConflict = makeConflict(
    'ai.prompt-templates.items.a.x',
    'ai.prompt-templates.items.a.x'
  );

  expect(
    buildVisibleSettingsTransferConflicts({
      conflicts: [shortConflict, dottedConflict],
      selected: new Set([dotted.id]),
      tree,
    })
  ).toEqual([{ conflict: dottedConflict, label: 'Dotted', transferNodeId: dotted.id }]);
});

function makeConflict(id: string, nodeId: string): SettingsTransferConflict {
  return {
    id,
    nodeId,
    kind: 'scalar',
    allowedDecisions: ['keep-local', 'use-imported'],
    defaultDecision: 'keep-local',
  };
}

function node(id: string, parentId: string | null, labelKey: string): SettingsTransferTreeNode {
  return {
    id,
    parentId,
    domainId: id.startsWith('styles') ? 'styles.surfaces' : 'interface.preferences',
    labelKey,
    descriptionKey: labelKey,
    kind: parentId?.endsWith('.items') ? 'item' : 'collection',
    classification: 'transferable',
    selectable: true,
    requiredBy: [],
    children: [],
  };
}
