// policyStateIds: [] - EffectV1 asset kinds and fields are immutable validation policy.
import {
  type EffectV1DiagnosticReporter,
  type EffectV1Record,
  isRecord,
  isSafeRelativePath,
  isSafeSvg,
  rejectUnknownKeys,
  requireIdentifier,
  requirePositiveNumber,
} from '../validation/shared.js';

const ASSET_KEYS = new Set([
  'byteLength',
  'dataUrl',
  'duration',
  'height',
  'id',
  'kind',
  'mimeType',
  'path',
  'sha256',
  'svgText',
  'width',
]);
const ASSET_KINDS = new Set(['audio', 'image', 'svg']);
const MIME_BY_KIND = {
  audio: /^audio\/(?:ogg|mpeg|wav)$/,
  image: /^image\/(?:jpeg|png|webp)$/,
  svg: /^image\/svg\+xml$/,
};
const MAX_ASSETS = 256;

export function validateEffectV1Assets(
  value: unknown,
  report: EffectV1DiagnosticReporter
): Map<string, EffectV1Record> {
  const assets = new Map<string, EffectV1Record>();
  if (!Array.isArray(value)) {
    report.error('ASSETS_TYPE', '$.assets', 'Expected an asset array.');
    return assets;
  }
  if (value.length > MAX_ASSETS) {
    report.error('ASSET_BUDGET', '$.assets', `At most ${MAX_ASSETS} assets are allowed.`);
  }
  value.forEach((asset, index) => validateAsset(asset, index, assets, report));
  return assets;
}

function validateAsset(
  value: unknown,
  index: number,
  assets: Map<string, EffectV1Record>,
  report: EffectV1DiagnosticReporter
): void {
  const path = `$.assets[${index}]`;
  if (!isRecord(value)) {
    report.error('ASSET_TYPE', path, 'Expected an asset object.');
    return;
  }
  rejectUnknownKeys(value, ASSET_KEYS, path, report);
  registerAsset(value, path, assets, report);
  validateAssetDeclaration(value, path, report);
  validateAssetContent(value, path, report);
  validateAssetIntegrity(value, path, report);
}

function registerAsset(
  asset: EffectV1Record,
  path: string,
  assets: Map<string, EffectV1Record>,
  report: EffectV1DiagnosticReporter
): void {
  if (!requireIdentifier(asset['id'], `${path}.id`, report)) return;
  if (assets.has(asset['id'])) {
    report.error('ASSET_ID_DUPLICATE', `${path}.id`, `Duplicate asset id "${asset['id']}".`);
  }
  assets.set(asset['id'], asset);
}

function validateAssetDeclaration(
  asset: EffectV1Record,
  path: string,
  report: EffectV1DiagnosticReporter
): void {
  if (!ASSET_KINDS.has(String(asset['kind']))) {
    report.error(
      'ASSET_KIND',
      `${path}.kind`,
      'Expected audio, image, or svg. Preview videos are transient runtime inputs, not bundle assets.'
    );
  }
  if (
    typeof asset['mimeType'] !== 'string' ||
    !MIME_BY_KIND[asset['kind'] as keyof typeof MIME_BY_KIND]?.test(asset['mimeType'])
  ) {
    report.error(
      'ASSET_MIME',
      `${path}.mimeType`,
      `MIME type does not match asset kind "${String(asset['kind'])}".`
    );
  }
  if (asset['path'] !== undefined && !isSafeRelativePath(asset['path'])) {
    report.error('ASSET_PATH_UNSAFE', `${path}.path`, 'Expected a safe relative asset path.');
  }
  for (const key of ['duration', 'height', 'width']) {
    if (asset[key] !== undefined) requirePositiveNumber(asset[key], `${path}.${key}`, report);
  }
}

function validateAssetContent(
  asset: EffectV1Record,
  path: string,
  report: EffectV1DiagnosticReporter
): void {
  if (
    asset['dataUrl'] !== undefined &&
    !isSafeDataUrl(asset['dataUrl'], asset['kind'], asset['mimeType'])
  ) {
    report.error(
      'ASSET_DATA_URL',
      `${path}.dataUrl`,
      'Embedded data must match the declared asset kind and MIME type.'
    );
  }
  if (asset['svgText'] !== undefined && !isSafeSvg(asset['svgText'])) {
    report.error(
      'ASSET_SVG_UNSAFE',
      `${path}.svgText`,
      'SVG contains executable or external content.'
    );
  }
  if (asset['kind'] === 'svg' && asset['dataUrl'] !== undefined) {
    report.error(
      'ASSET_SVG_DATA_URL_FORBIDDEN',
      `${path}.dataUrl`,
      'SVG data URLs cannot be inspected safely.',
      'Use sanitized svgText or a bundle path.'
    );
  }
  if (asset['kind'] !== 'svg' && asset['svgText'] !== undefined) {
    report.error('ASSET_CONTENT_KIND', `${path}.svgText`, 'Only SVG assets can contain svgText.');
  }
  if (
    asset['dataUrl'] === undefined &&
    asset['svgText'] === undefined &&
    asset['path'] === undefined
  ) {
    report.error(
      'ASSET_CONTENT_MISSING',
      path,
      'Asset needs embedded content or a safe bundle path.'
    );
  }
}

function validateAssetIntegrity(
  asset: EffectV1Record,
  path: string,
  report: EffectV1DiagnosticReporter
): void {
  if (asset['byteLength'] !== undefined)
    requirePositiveNumber(asset['byteLength'], `${path}.byteLength`, report);
  if (
    asset['sha256'] !== undefined &&
    (typeof asset['sha256'] !== 'string' || !/^[a-f0-9]{64}$/.test(asset['sha256']))
  ) {
    report.error('ASSET_SHA256', `${path}.sha256`, 'Expected a lowercase SHA-256 hex digest.');
  }
  const embedded = asset['dataUrl'] !== undefined || asset['svgText'] !== undefined;
  if (embedded && asset['byteLength'] === undefined) {
    report.error(
      'ASSET_BYTE_LENGTH_REQUIRED',
      `${path}.byteLength`,
      'Embedded assets require byteLength integrity metadata.'
    );
  }
  if (embedded && asset['sha256'] === undefined) {
    report.error(
      'ASSET_SHA256_REQUIRED',
      `${path}.sha256`,
      'Embedded assets require a SHA-256 digest.'
    );
  }
}

function isSafeDataUrl(value: unknown, kind: unknown, mimeType: unknown): boolean {
  if (typeof value !== 'string' || value.length > 3_000_000) return false;
  if (!ASSET_KINDS.has(String(kind)) || typeof mimeType !== 'string') return false;
  const prefix = `data:${mimeType};base64,`;
  if (!value.startsWith(prefix) || value.length === prefix.length) return false;
  for (const character of value.slice(prefix.length)) {
    const normalized = character.toLowerCase();
    const isLetter = normalized >= 'a' && normalized <= 'z';
    const isDigit = character >= '0' && character <= '9';
    if (!isLetter && !isDigit && character !== '+' && character !== '/' && character !== '=')
      return false;
  }
  return true;
}
