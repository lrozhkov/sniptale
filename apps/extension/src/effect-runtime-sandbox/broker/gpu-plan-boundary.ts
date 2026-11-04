import { EFFECT_V1_GRAPH_LIMITS } from '@sniptale/runtime-contracts/effect-v1';
import { EFFECT_SVG_VECTOR_LIMITS } from '../../contracts/effect-runtime/svg-vector';
import { isImageBitmap } from '../../contracts/effect-runtime/bitmap-lifetime';
import {
  hasExactKeys,
  isRecord,
  parseEffectRuntimeIdentity,
  sameEffectRuntimeIdentity,
} from '../../contracts/effect-runtime/identity';
import { isEffectRuntimeImmutableId } from '../../contracts/effect-runtime/immutable-refs';
import type {
  EffectRuntimeGpuOperation,
  EffectRuntimeGpuPass,
  EffectRuntimeGpuResource,
  EffectRuntimeGpuRect,
  EffectRuntimeGpuTransform,
  EffectRuntimeGpuFilter,
  EffectRuntimeGpuShadow,
  EffectRuntimeGpuSource,
} from '../../contracts/effect-runtime/gpu-plan';
import type {
  EffectRuntimeGpuPlanResult,
  EffectRuntimeWorkerMessage,
} from '../../contracts/effect-runtime/types';
import {
  assertEffectDecodedRaster,
  EFFECT_RUNTIME_RESOURCE_LIMITS,
} from '../../features/video/composition/effect-runtime/runtime/resource-limits';

// Scalar commands can emit fill and stroke for every admitted SVG part.
const MAX_NATIVE_PAINTS =
  EFFECT_V1_GRAPH_LIMITS.expandedCommands * 2 * EFFECT_SVG_VECTOR_LIMITS.maxParts;
const MAX_PLAN_RESOURCES =
  MAX_NATIVE_PAINTS +
  EFFECT_V1_GRAPH_LIMITS.expandedCommands +
  EFFECT_RUNTIME_RESOURCE_LIMITS.maxInputFrames +
  EFFECT_RUNTIME_RESOURCE_LIMITS.maxDecodedRasterEntries +
  1;

/** Parse evaluated, closed GPU data without acquiring ownership of transferred resources. */
export function parseEffectRuntimeGpuPlan(
  value: unknown,
  expected: EffectRuntimeWorkerMessage
): EffectRuntimeGpuPlanResult | null {
  if (
    expected.renderTarget !== 'gpu-plan' ||
    !isRecord(value) ||
    !hasExactKeys(value, [
      'kind',
      'effectInstanceId',
      'requestId',
      'snapshotId',
      'sequenceId',
      'acknowledged',
      'width',
      'height',
      'logicalWidth',
      'logicalHeight',
      'resources',
      'passes',
      'rootPass',
      'inputResources',
    ])
  )
    return null;
  const identity = parseEffectRuntimeIdentity(value);
  const ack = value['acknowledged'];
  if (
    !identity ||
    !sameEffectRuntimeIdentity(identity, expected) ||
    value['kind'] !== 'gpu-plan' ||
    !isRecord(ack) ||
    !hasExactKeys(ack, ['documentId', 'assetSelectionId']) ||
    !isEffectRuntimeImmutableId(ack['documentId']) ||
    !isEffectRuntimeImmutableId(ack['assetSelectionId']) ||
    ack['documentId'] !== expected.documentRef.id ||
    ack['assetSelectionId'] !== expected.assetSelectionRef.id ||
    value['width'] !== expected.renderWidth ||
    value['height'] !== expected.renderHeight ||
    value['logicalWidth'] !== expected.width ||
    value['logicalHeight'] !== expected.height
  )
    return null;
  const resources = parseResources(value['resources']);
  if (!resources) return null;
  const inputResources = parseInputs(value['inputResources'], resources, expected);
  const passes = parsePasses(value['passes'], resources);
  if (!inputResources || !passes || !id(value['rootPass'])) return null;
  const root = passes.find((pass) => pass.id === value['rootPass']);
  if (
    !root ||
    root.width !== expected.renderWidth ||
    root.height !== expected.renderHeight ||
    root.logicalWidth !== expected.width ||
    root.logicalHeight !== expected.height
  )
    return null;
  return {
    ...identity,
    kind: 'gpu-plan',
    acknowledged: { documentId: ack['documentId'], assetSelectionId: ack['assetSelectionId'] },
    width: expected.renderWidth,
    height: expected.renderHeight,
    logicalWidth: expected.width,
    logicalHeight: expected.height,
    resources,
    passes,
    rootPass: value['rootPass'],
    inputResources,
  };
}

function parseResources(value: unknown): EffectRuntimeGpuResource[] | null {
  if (!Array.isArray(value) || value.length > MAX_PLAN_RESOURCES) return null;
  const resources: EffectRuntimeGpuResource[] = [];
  const ids = new Set<number>();
  const handles = new Set<ImageBitmap>();
  let bytes = 0;
  for (const resource of value) {
    if (
      !isRecord(resource) ||
      !hasExactKeys(resource, ['id', 'kind', 'bitmap', 'width', 'height']) ||
      !id(resource['id']) ||
      ids.has(resource['id']) ||
      !isImageBitmap(resource['bitmap']) ||
      handles.has(resource['bitmap']) ||
      !physical(resource['width'], resource['height']) ||
      resource['width'] !== resource['bitmap'].width ||
      resource['height'] !== resource['bitmap'].height ||
      (resource['kind'] !== 'input' &&
        resource['kind'] !== 'asset-clone' &&
        resource['kind'] !== 'primitive' &&
        resource['kind'] !== 'coverage')
    )
      return null;
    bytes += resource['bitmap'].width * resource['bitmap'].height * 4;
    if (bytes > EFFECT_RUNTIME_RESOURCE_LIMITS.maxDecodedRasterBytes) return null;
    ids.add(resource['id']);
    handles.add(resource['bitmap']);
    resources.push({
      id: resource['id'],
      kind: resource['kind'],
      bitmap: resource['bitmap'],
      width: resource['bitmap'].width,
      height: resource['bitmap'].height,
    });
  }
  return resources;
}

function parseInputs(
  value: unknown,
  resources: readonly EffectRuntimeGpuResource[],
  expected: EffectRuntimeWorkerMessage
): EffectRuntimeGpuPlanResult['inputResources'] | null {
  if (!isRecord(value) || !hasExactKeys(value, Object.keys(expected.inputFrames))) return null;
  const inputs: EffectRuntimeGpuPlanResult['inputResources'] = {};
  const referenced = new Set<number>();
  for (const name of Object.keys(value)) {
    if (name !== 'source' && name !== 'from' && name !== 'to') return null;
    const input = expected.inputFrames[name];
    const ref = value[name];
    if (!input || !id(ref)) return null;
    const resource = resources.find((item) => item.id === ref);
    if (
      !resource ||
      resource.kind !== 'input' ||
      resource.width !== input.width ||
      resource.height !== input.height
    )
      return null;
    inputs[name] = ref;
    referenced.add(ref);
  }
  return resources.some((resource) => resource.kind === 'input' && !referenced.has(resource.id))
    ? null
    : inputs;
}

function parsePasses(
  value: unknown,
  resources: readonly EffectRuntimeGpuResource[]
): EffectRuntimeGpuPass[] | null {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > EFFECT_V1_GRAPH_LIMITS.expandedCommands
  )
    return null;
  const resourcesById = new Map(resources.map((resource) => [resource.id, resource]));
  const usedPrimitives = new Set<number>();
  let scalarOperations = 0;
  const passes: EffectRuntimeGpuPass[] = [];
  const depths = new Map<number, number>();
  let operations = 0;
  let bytes = resources.reduce((sum, resource) => sum + resource.width * resource.height * 4, 0);
  for (const pass of value) {
    if (
      !isRecord(pass) ||
      !hasExactKeys(pass, [
        'id',
        'width',
        'height',
        'logicalWidth',
        'logicalHeight',
        'operations',
      ]) ||
      !id(pass['id']) ||
      depths.has(pass['id']) ||
      !finite(pass['width']) ||
      !finite(pass['height']) ||
      !physical(pass['width'], pass['height']) ||
      !positive(pass['logicalWidth']) ||
      !positive(pass['logicalHeight']) ||
      !Array.isArray(pass['operations'])
    )
      return null;
    bytes += pass['width'] * pass['height'] * 4;
    operations += pass['operations'].length;
    if (
      bytes > EFFECT_RUNTIME_RESOURCE_LIMITS.maxDecodedRasterBytes ||
      operations > MAX_NATIVE_PAINTS
    )
      return null;
    const parsed: EffectRuntimeGpuOperation[] = [];
    let depth = 1;
    for (const operation of pass['operations']) {
      if (!isOperation(operation)) return null;
      if (operation.coverage !== undefined) {
        const coverage = resourcesById.get(operation.coverage);
        if (
          !coverage ||
          coverage.kind !== 'coverage' ||
          coverage.width !== pass['width'] ||
          coverage.height !== pass['height']
        )
          return null;
      }
      if (operation.op === 'draw') {
        if (operation.source.kind === 'resource') {
          const resource = resourcesById.get(operation.source.id);
          if (!resource || resource.kind === 'coverage') return null;
          if (resource.kind === 'primitive') {
            // Each native paint transfers one fresh bitmap; immutable snapshots are emitted once.
            if (usedPrimitives.has(resource.id)) return null;
            usedPrimitives.add(resource.id);
          } else scalarOperations += 1;
        } else {
          scalarOperations += 1;
          const priorDepth = depths.get(operation.source.id);
          if (priorDepth === undefined) return null;
          depth = Math.max(depth, priorDepth + 1);
        }
      }
      if (operation.op === 'clear') scalarOperations += 1;
      if (scalarOperations > EFFECT_V1_GRAPH_LIMITS.expandedCommands) return null;
      parsed.push(operation);
    }
    if (depth > EFFECT_V1_GRAPH_LIMITS.graphDepth) return null;
    depths.set(pass['id'], depth);
    passes.push({
      id: pass['id'],
      width: pass['width'],
      height: pass['height'],
      logicalWidth: pass['logicalWidth'],
      logicalHeight: pass['logicalHeight'],
      operations: parsed,
    });
  }
  return passes;
}
function isOperation(value: unknown): value is EffectRuntimeGpuOperation {
  if (!isRecord(value)) return false;
  const coverageKeys = Object.hasOwn(value, 'coverage') ? ['coverage'] : [];
  if (coverageKeys.length && !id(value['coverage'])) return false;
  if (value['op'] === 'clear') return hasExactKeys(value, ['op', ...coverageKeys]);
  return (
    value['op'] === 'draw' &&
    hasExactKeys(value, [
      'op',
      'source',
      'sourceRect',
      'destination',
      'transform',
      'alpha',
      'blend',
      'filter',
      'shadow',
      ...coverageKeys,
    ]) &&
    source(value['source']) &&
    rect(value['sourceRect']) &&
    rect(value['destination']) &&
    transform(value['transform']) &&
    finite(value['alpha']) &&
    (value['blend'] === 'source-over' ||
      value['blend'] === 'lighter' ||
      value['blend'] === 'screen' ||
      value['blend'] === 'source-atop' ||
      value['blend'] === 'destination-in') &&
    filter(value['filter']) &&
    shadow(value['shadow'])
  );
}
function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
function positive(value: unknown): value is number {
  return finite(value) && value > 0;
}
function id(value: unknown): value is number {
  return finite(value) && Number.isSafeInteger(value) && value >= 0;
}
function physical(width: unknown, height: unknown): boolean {
  try {
    assertEffectDecodedRaster(width, height);
    return true;
  } catch {
    return false;
  }
}
function rect(value: unknown): value is EffectRuntimeGpuRect {
  return (
    isRecord(value) &&
    hasExactKeys(value, ['x', 'y', 'width', 'height']) &&
    ['x', 'y', 'width', 'height'].every((key) => finite(value[key]))
  );
}
function transform(value: unknown): value is EffectRuntimeGpuTransform {
  return Array.isArray(value) && value.length === 6 && value.every(finite);
}
function filter(value: unknown): value is EffectRuntimeGpuFilter {
  return (
    isRecord(value) &&
    hasExactKeys(value, ['blur', 'brightness', 'saturate']) &&
    ['blur', 'brightness', 'saturate'].every((key) => finite(value[key]))
  );
}
function shadow(value: unknown): value is EffectRuntimeGpuShadow {
  return (
    isRecord(value) &&
    hasExactKeys(value, ['color', 'blur', 'offsetX', 'offsetY']) &&
    ['blur', 'offsetX', 'offsetY'].every((key) => finite(value[key])) &&
    Array.isArray(value['color']) &&
    value['color'].length === 4 &&
    value['color'].every(finite)
  );
}
function source(value: unknown): value is EffectRuntimeGpuSource {
  return (
    isRecord(value) &&
    hasExactKeys(value, ['kind', 'id']) &&
    (value['kind'] === 'resource' || value['kind'] === 'pass') &&
    id(value['id'])
  );
}

/** Close every flat-table handle once, even when malformed metadata prevents parsing. */
export function closeEffectRuntimeGpuPlanResources(value: unknown): void {
  if (!isRecord(value) || !Array.isArray(value['resources'])) return;
  const closed = new Set<ImageBitmap>();
  for (const resource of value['resources']) {
    if (!isRecord(resource) || !isImageBitmap(resource['bitmap']) || closed.has(resource['bitmap']))
      continue;
    closed.add(resource['bitmap']);
    resource['bitmap'].close();
  }
}
