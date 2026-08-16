import {
  SETTINGS_TRANSFER_FORMAT,
  SETTINGS_TRANSFER_FORMAT_VERSION,
  stringifySettingsTransferPackage,
  type SettingsTransferDomainPayload,
  type SettingsTransferExportKind,
  type SettingsTransferPackageV1,
  type SettingsTransferTreeNode,
} from '../../contracts/settings-transfer';
import { closeSettingsTransferSelection, flattenSettingsTransferTree } from './selection';
import { normalizeSettingsTransferRegistryField } from './node-projection';

export function buildSettingsTransferPackage(args: {
  appVersion: string;
  domains: Record<string, SettingsTransferDomainPayload>;
  exportKind: SettingsTransferExportKind;
  selectedNodeIds: readonly string[];
  tree: readonly SettingsTransferTreeNode[];
  now?: Date;
}): { package: SettingsTransferPackageV1; fileText: string; selectedNodeIds: string[] } {
  const allNodes = flattenSettingsTransferTree(args.tree);
  const selectedNodeIds =
    args.exportKind === 'backup'
      ? allNodes.filter((node) => node.selectable).map((node) => node.id)
      : closeSettingsTransferSelection(args.selectedNodeIds, args.tree);
  const selected = new Set(selectedNodeIds);
  const domains =
    args.exportKind === 'backup'
      ? args.domains
      : Object.fromEntries(
          Object.entries(args.domains).flatMap(([domainId, domainPayload]) => {
            if (!selected.has(domainId)) return [];
            return [[domainId, selectDomainPayload(domainId, domainPayload, selected)]];
          })
        );
  const transferPackage: SettingsTransferPackageV1 = {
    format: SETTINGS_TRANSFER_FORMAT,
    formatVersion: SETTINGS_TRANSFER_FORMAT_VERSION,
    exportKind: args.exportKind,
    exportedAt: (args.now ?? new Date()).toISOString(),
    source: { appVersion: args.appVersion },
    domains,
  };
  return {
    package: transferPackage,
    fileText: stringifySettingsTransferPackage(transferPackage),
    selectedNodeIds,
  };
}

function selectDomainPayload(
  domainId: string,
  payload: SettingsTransferDomainPayload,
  selected: ReadonlySet<string>
): SettingsTransferDomainPayload {
  if (!payload.data || typeof payload.data !== 'object' || Array.isArray(payload.data))
    return payload;
  if (domainId === 'styles.tool-presets') {
    return selectToolPresetPayload(payload, selected);
  }
  if (domainId === 'styles.palettes') return selectPalettePayload(payload, selected);
  const data: Record<string, SettingsTransferDomainPayload['data']> = {};
  for (const [field, value] of Object.entries(payload.data)) {
    if (domainId === 'ai.prompt-templates' && field === 'order') continue;
    const normalizedField = normalizeSettingsTransferRegistryField(domainId, field);
    const fieldId = `${domainId}.${normalizedField}`;
    if (!selected.has(fieldId)) continue;
    if (!Array.isArray(value)) {
      data[field] = value;
      continue;
    }
    const hasSelectedItems = [...selected].some((id) => id.startsWith(`${fieldId}.`));
    const selectedItems = value.filter((item) => {
      if (!hasSelectedItems) return true;
      if (!item || typeof item !== 'object' || Array.isArray(item)) return true;
      const id = item['id'];
      return typeof id !== 'string' || selected.has(`${fieldId}.${id}`);
    });
    data[field] = selectedItems;
    if (domainId === 'ai.prompt-templates' && field === 'items') {
      const selectedIds = new Set(
        selectedItems.flatMap((item) =>
          item && typeof item === 'object' && !Array.isArray(item) && typeof item['id'] === 'string'
            ? [item['id']]
            : []
        )
      );
      const order = payload.data['order'];
      if (Array.isArray(order)) data['order'] = order.filter((id) => selectedIds.has(String(id)));
    }
  }
  return { schemaVersion: payload.schemaVersion, data };
}

function selectPalettePayload(
  payload: SettingsTransferDomainPayload,
  selected: ReadonlySet<string>
): SettingsTransferDomainPayload {
  const data = payload.data as Record<string, SettingsTransferDomainPayload['data']>;
  const slots = isJsonRecord(data['slots']) ? data['slots'] : {};
  const selectedSlotIds = [...selected]
    .filter((id) => id.startsWith('styles.palettes.items.slot-'))
    .map((id) => id.slice('styles.palettes.items.'.length));
  const selectedSlots =
    selectedSlotIds.length === 0
      ? slots
      : Object.fromEntries(
          selectedSlotIds.flatMap((id) => {
            const value = slots[id];
            return value === undefined ? [] : ([[id, value]] as const);
          })
        );
  return { schemaVersion: payload.schemaVersion, data: { slots: selectedSlots } };
}

function selectToolPresetPayload(
  payload: SettingsTransferDomainPayload,
  selected: ReadonlySet<string>
): SettingsTransferDomainPayload {
  const source = payload.data as Record<string, SettingsTransferDomainPayload['data']>;
  const data: Record<string, SettingsTransferDomainPayload['data']> = {};
  for (const family of ['step', 'sceneBackground']) {
    const collection = source[family];
    if (!collection || typeof collection !== 'object' || Array.isArray(collection)) continue;
    const presets = Array.isArray(collection['presets']) ? collection['presets'] : [];
    const selectedPresets = presets.filter((preset) => {
      if (!preset || typeof preset !== 'object' || Array.isArray(preset)) return false;
      return (
        typeof preset['id'] === 'string' &&
        selected.has(`styles.tool-presets.items.${family}:${preset['id']}`)
      );
    });
    if (selectedPresets.length > 0) data[family] = { ...collection, presets: selectedPresets };
  }
  return { schemaVersion: payload.schemaVersion, data };
}

export function filterSettingsTransferDomainsBySelection(args: {
  domains: Record<string, SettingsTransferDomainPayload>;
  selectedNodeIds: readonly string[];
  tree: readonly SettingsTransferTreeNode[];
}): Record<string, SettingsTransferDomainPayload> {
  const selected = new Set(closeSettingsTransferSelection(args.selectedNodeIds, args.tree));
  return Object.fromEntries(
    Object.entries(args.domains).flatMap(([domainId, payload]) =>
      selected.has(domainId) ? [[domainId, selectDomainPayload(domainId, payload, selected)]] : []
    )
  );
}

export function buildExactRestoreDomainsBySelection(args: {
  current: Record<string, SettingsTransferDomainPayload>;
  imported: Record<string, SettingsTransferDomainPayload>;
  selectedNodeIds: readonly string[];
  tree: readonly SettingsTransferTreeNode[];
}): Record<string, SettingsTransferDomainPayload> {
  const selectedNodeIds = closeSettingsTransferSelection(args.selectedNodeIds, args.tree);
  const selected = new Set(selectedNodeIds);
  const projected = filterSettingsTransferDomainsBySelection({
    domains: args.imported,
    selectedNodeIds,
    tree: args.tree,
  });
  const nodes = flattenSettingsTransferTree(args.tree);
  return Object.fromEntries(
    Object.entries(projected).map(([domainId, payload]) => {
      const current = args.current[domainId];
      return [
        domainId,
        {
          schemaVersion: payload.schemaVersion,
          data: current
            ? overlayExactSelection({
                current: current.data,
                projected: payload.data,
                domainId,
                path: [],
                selected,
                nodes,
              })
            : payload.data,
        },
      ];
    })
  );
}

function overlayExactSelection(args: {
  current: SettingsTransferDomainPayload['data'];
  projected: SettingsTransferDomainPayload['data'];
  domainId: string;
  path: string[];
  selected: ReadonlySet<string>;
  nodes: readonly SettingsTransferTreeNode[];
}): SettingsTransferDomainPayload['data'] {
  if (Array.isArray(args.current) && Array.isArray(args.projected)) {
    return overlayExactArray(args);
  }
  if (!isJsonRecord(args.current) || !isJsonRecord(args.projected)) return args.projected;
  const result = { ...args.current };
  for (const [key, projected] of Object.entries(args.projected)) {
    const current = args.current[key];
    result[key] =
      current === undefined
        ? projected
        : overlayExactSelection({ ...args, current, projected, path: [...args.path, key] });
  }
  return result;
}

function overlayExactArray(
  args: Parameters<typeof overlayExactSelection>[0]
): SettingsTransferDomainPayload['data'] {
  const current = args.current as SettingsTransferDomainPayload['data'][];
  const projected = args.projected as SettingsTransferDomainPayload['data'][];
  const fieldId = exactSelectionFieldId(args.domainId, args.path);
  const itemNodes = args.nodes.filter((node) => node.parentId === fieldId);
  const selectedItemCount = itemNodes.filter((node) => args.selected.has(node.id)).length;
  if (itemNodes.length === 0 || selectedItemCount === 0 || selectedItemCount === itemNodes.length) {
    return projected;
  }
  if (args.domainId === 'ai.prompt-templates' && args.path.at(-1) === 'order') {
    const importedIds = new Set(
      projected.filter((value): value is string => typeof value === 'string')
    );
    return [...current.filter((value) => !importedIds.has(String(value))), ...projected];
  }
  if (!current.every(isJsonRecordWithId) || !projected.every(isJsonRecordWithId)) return projected;
  const replacements = new Map(projected.map((item) => [item.id, item]));
  const merged = current.map((item) => replacements.get(item.id) ?? item);
  const currentIds = new Set(current.map((item) => item.id));
  return [...merged, ...projected.filter((item) => !currentIds.has(item.id))];
}

function exactSelectionFieldId(domainId: string, path: readonly string[]): string {
  if (domainId === 'styles.tool-presets') return 'styles.tool-presets.items';
  const field = path[0] ?? '';
  return `${domainId}.${normalizeSettingsTransferRegistryField(domainId, field)}`;
}

function isJsonRecord(
  value: SettingsTransferDomainPayload['data'] | undefined
): value is Record<string, SettingsTransferDomainPayload['data']> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isJsonRecordWithId(
  value: SettingsTransferDomainPayload['data']
): value is Record<string, SettingsTransferDomainPayload['data']> & { id: string } {
  return isJsonRecord(value) && typeof value['id'] === 'string';
}
