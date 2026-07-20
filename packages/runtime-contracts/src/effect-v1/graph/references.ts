import type { EffectV1ReadReferences } from './model.js';
import type { EffectV1DiagnosticReporter, EffectV1Record } from '../validation/shared.js';

export function validateCommandReferences(
  command: EffectV1Record,
  path: string,
  assets: Map<string, EffectV1Record>,
  runtimeInputs: Set<string>,
  references: EffectV1ReadReferences,
  report: EffectV1DiagnosticReporter
): void {
  if (command['layerId'] !== undefined && !references.layerIds.has(String(command['layerId']))) {
    report.error(
      'COMMAND_LAYER_UNKNOWN',
      `${path}.layerId`,
      `Unknown layer "${String(command['layerId'])}".`,
      'Use a declared leaf layer id or remove layerId.'
    );
  }
  if (command['assetId'] !== undefined && !assets.has(String(command['assetId']))) {
    report.error(
      'COMMAND_ASSET_UNKNOWN',
      `${path}.assetId`,
      `Unknown asset "${String(command['assetId'])}".`
    );
  }
  if (command['op'] === 'image') validateImageSource(command, path, assets, runtimeInputs, report);
  if (command['op'] === 'svgParts' && typeof command['assetId'] === 'string') {
    const asset = assets.get(command['assetId']);
    if (asset && asset['kind'] !== 'svg') {
      report.error(
        'SVG_PARTS_ASSET_KIND',
        `${path}.assetId`,
        `svgParts requires an SVG asset; "${command['assetId']}" is ${String(asset['kind'])}.`
      );
    }
  }
}

function validateImageSource(
  command: EffectV1Record,
  path: string,
  assets: Map<string, EffectV1Record>,
  runtimeInputs: Set<string>,
  report: EffectV1DiagnosticReporter
): void {
  const hasAsset = typeof command['assetId'] === 'string';
  const hasInput = typeof command['input'] === 'string';
  if (hasAsset === hasInput) {
    report.error(
      'IMAGE_SOURCE',
      path,
      'Image command requires exactly one assetId or runtime input.',
      'Use a declared asset id, or source/from/to allowed by the document kind.'
    );
    return;
  }
  if (hasAsset && !assets.has(String(command['assetId']))) return;
  if (hasAsset) validateImageAssetKind(command, path, assets, report);
  if (hasInput && !runtimeInputs.has(String(command['input']))) {
    report.error(
      'IMAGE_INPUT_UNAVAILABLE',
      `${path}.input`,
      `Runtime input "${String(command['input'])}" is unavailable for this effect kind.`,
      runtimeInputs.size > 0
        ? `Use one of: ${[...runtimeInputs].join(', ')}.`
        : 'Use assetId for a standalone effect.'
    );
  }
}

function validateImageAssetKind(
  command: EffectV1Record,
  path: string,
  assets: Map<string, EffectV1Record>,
  report: EffectV1DiagnosticReporter
): void {
  const asset = assets.get(String(command['assetId']));
  if (asset && asset['kind'] !== 'image' && asset['kind'] !== 'svg') {
    report.error(
      'IMAGE_ASSET_KIND',
      `${path}.assetId`,
      `Image command cannot render ${String(asset['kind'])} asset "${String(command['assetId'])}".`,
      'Use an image/SVG asset, or a kind-specific temporary runtime input.'
    );
  }
}
