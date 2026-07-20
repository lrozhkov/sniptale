import {
  type EffectV1DiagnosticReporter,
  type EffectV1Record,
  isRecord,
} from '../validation/shared.js';

export function validateLayerHierarchy(
  orderedLayers: unknown[],
  layers: Map<string, EffectV1Record>,
  report: EffectV1DiagnosticReporter
): void {
  orderedLayers.forEach((layer, index) => validateLayerParent(layer, index, layers, report));
  for (const [groupId, group] of layers) {
    if (group['type'] !== 'group') continue;
    const indexes = orderedLayers
      .map((layer, index) =>
        isRecord(layer) && isDescendantOf(layer, groupId, layers) ? index : -1
      )
      .filter((index) => index >= 0);
    if (indexes.length > 0 && indexes[indexes.length - 1]! - indexes[0]! + 1 !== indexes.length) {
      report.error(
        'LAYER_SUBTREE_DISCONTIGUOUS',
        '$.layers',
        `Group "${groupId}" does not form a continuous render-order segment.`
      );
    }
  }
}

function validateLayerParent(
  value: unknown,
  index: number,
  layers: Map<string, EffectV1Record>,
  report: EffectV1DiagnosticReporter
): void {
  if (!isRecord(value) || value['parentId'] == null) return;
  const path = `$.layers[${index}].parentId`;
  const parent = layers.get(String(value['parentId']));
  if (!parent)
    report.error('LAYER_PARENT_UNKNOWN', path, `Unknown parent "${String(value['parentId'])}".`);
  else if (parent['type'] !== 'group')
    report.error('LAYER_PARENT_NOT_GROUP', path, 'A layer parent must be a structural group.');
  const visited = new Set<string>();
  let cursor: EffectV1Record | undefined = value;
  let depth = 0;
  while (cursor?.['parentId'] != null) {
    if (visited.has(String(cursor['id']))) {
      report.error('LAYER_PARENT_CYCLE', path, 'Layer hierarchy contains a cycle.');
      break;
    }
    visited.add(String(cursor['id']));
    cursor = layers.get(String(cursor['parentId']));
    depth += 1;
    if (depth > 8) {
      report.error('LAYER_DEPTH', path, 'Layer nesting exceeds eight levels.');
      break;
    }
  }
}

function isDescendantOf(
  layer: EffectV1Record,
  groupId: string,
  layers: Map<string, EffectV1Record>
): boolean {
  let cursor: EffectV1Record | undefined = layer;
  const visited = new Set<string>();
  while (cursor?.['parentId'] != null) {
    if (String(cursor['parentId']) === groupId) return true;
    if (visited.has(String(cursor['id']))) return false;
    visited.add(String(cursor['id']));
    cursor = layers.get(String(cursor['parentId']));
  }
  return false;
}
