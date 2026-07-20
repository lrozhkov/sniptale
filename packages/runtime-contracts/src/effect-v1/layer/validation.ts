import {
  type EffectV1DiagnosticReporter,
  type EffectV1Record,
  isRecord,
  rejectUnknownKeys,
  requireIdentifier,
  requireString,
} from '../validation/shared.js';
import { validateLayerHierarchy } from './hierarchy.js';
import {
  EDITOR_KEYS,
  LAYER_KEYS,
  LAYER_NUMBER_KEYS,
  LAYER_TYPES,
  SPATIAL_LAYER_TYPES,
} from './rules.js';

export function validateEffectV1Layers(
  value: unknown,
  assets: Map<string, EffectV1Record>,
  report: EffectV1DiagnosticReporter
): Map<string, EffectV1Record> {
  const layers = new Map<string, EffectV1Record>();
  if (!Array.isArray(value)) {
    report.error('LAYERS_TYPE', '$.layers', 'Expected a layer array.');
    return layers;
  }
  value.forEach((layer, index) => {
    const path = `$.layers[${index}]`;
    if (!isRecord(layer)) {
      report.error('LAYER_TYPE', path, 'Expected a layer object.');
      return;
    }
    rejectUnknownKeys(layer, LAYER_KEYS, path, report);
    if (requireIdentifier(layer['id'], `${path}.id`, report)) {
      if (layers.has(layer['id'])) {
        report.error('LAYER_ID_DUPLICATE', `${path}.id`, `Duplicate layer id "${layer['id']}".`);
      }
      layers.set(layer['id'], layer);
    }
    if (requireString(layer['type'], `${path}.type`, report)) {
      if (!LAYER_TYPES.has(layer['type'])) {
        report.error(
          'LAYER_KIND',
          `${path}.type`,
          `Unsupported layer type "${layer['type']}".`,
          `Use one of: ${[...LAYER_TYPES].join(', ')}.`
        );
      }
    }
    validateLayerValues(layer, path, report);
    if (layer['assetId'] !== undefined && !assets.has(String(layer['assetId']))) {
      report.error(
        'LAYER_ASSET_UNKNOWN',
        `${path}.assetId`,
        `Unknown asset "${String(layer['assetId'])}".`,
        'Declare every runtime asset in this document; pack-global fallback is forbidden.'
      );
    }
    validateLayerContract(layer, path, assets, report);
  });
  validateLayerHierarchy(value, layers, report);
  return layers;
}

function validateLayerContract(
  layer: EffectV1Record,
  path: string,
  assets: Map<string, EffectV1Record>,
  report: EffectV1DiagnosticReporter
): void {
  validateSpatialLayer(layer, path, report);
  validateAssetLayer(layer, path, assets, report);
  if (layer['type'] === 'text' && typeof layer['text'] !== 'string') {
    report.error('LAYER_TEXT_REQUIRED', `${path}.text`, 'Text layer requires string content.');
  }
  validateGroupLayer(layer, path, report);
}

function validateSpatialLayer(
  layer: EffectV1Record,
  path: string,
  report: EffectV1DiagnosticReporter
): void {
  if (SPATIAL_LAYER_TYPES.has(String(layer['type']))) {
    for (const field of ['height', 'width']) {
      if (typeof layer[field] !== 'number' || !Number.isFinite(layer[field]) || layer[field] <= 0) {
        report.error(
          'LAYER_SIZE_REQUIRED',
          `${path}.${field}`,
          `Spatial layer "${layer['type']}" requires a positive ${field}.`
        );
      }
    }
  }
}

function validateAssetLayer(
  layer: EffectV1Record,
  path: string,
  assets: Map<string, EffectV1Record>,
  report: EffectV1DiagnosticReporter
): void {
  if (['audio', 'imageAsset', 'svgAsset'].includes(String(layer['type']))) {
    if (typeof layer['assetId'] !== 'string') {
      report.error(
        'LAYER_ASSET_REQUIRED',
        `${path}.assetId`,
        `Layer "${layer['type']}" requires an assetId.`
      );
      return;
    }
    const asset = assets.get(layer['assetId']);
    const expectedKinds =
      layer['type'] === 'audio' ? ['audio'] : layer['type'] === 'svgAsset' ? ['svg'] : ['image'];
    if (asset && !expectedKinds.includes(String(asset['kind']))) {
      report.error(
        'LAYER_ASSET_KIND',
        `${path}.assetId`,
        `Layer "${layer['type']}" cannot use ${String(asset['kind'])} asset "${layer['assetId']}".`
      );
    }
  }
}

function validateGroupLayer(
  layer: EffectV1Record,
  path: string,
  report: EffectV1DiagnosticReporter
): void {
  if (layer['type'] === 'group') {
    const forbidden = [
      'assetId',
      'editor',
      'height',
      'opacity',
      'rotation',
      'scaleX',
      'scaleY',
      'width',
      'x',
      'y',
    ];
    for (const field of forbidden) {
      if (layer[field] !== undefined) {
        report.error(
          'GROUP_FIELD_FORBIDDEN',
          `${path}.${field}`,
          `Structural groups cannot define "${field}".`
        );
      }
    }
  }
}

function validateLayerValues(
  layer: EffectV1Record,
  path: string,
  report: EffectV1DiagnosticReporter
): void {
  for (const key of LAYER_NUMBER_KEYS) {
    if (
      layer[key] !== undefined &&
      (typeof layer[key] !== 'number' || !Number.isFinite(layer[key]))
    ) {
      report.error('LAYER_NUMBER', `${path}.${key}`, 'Expected a finite number.');
    }
  }
  for (const key of ['locked', 'pathClosed', 'visible']) {
    if (layer[key] !== undefined && typeof layer[key] !== 'boolean') {
      report.error('LAYER_BOOLEAN', `${path}.${key}`, 'Expected a boolean.');
    }
  }
  if (layer['editor'] !== undefined) {
    if (!isRecord(layer['editor'])) {
      report.error('LAYER_EDITOR_TYPE', `${path}.editor`, 'Expected an editor capability object.');
    } else {
      rejectUnknownKeys(layer['editor'], EDITOR_KEYS, `${path}.editor`, report);
      for (const key of ['keyframeProperties', 'operations', 'properties', 'transform']) {
        if (
          layer['editor'][key] !== undefined &&
          (!Array.isArray(layer['editor'][key]) ||
            layer['editor'][key].some((item: unknown) => typeof item !== 'string'))
        ) {
          report.error('LAYER_EDITOR_LIST', `${path}.editor.${key}`, 'Expected a string array.');
        }
      }
    }
  }
}
