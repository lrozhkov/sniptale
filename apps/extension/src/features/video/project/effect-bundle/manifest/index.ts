// policyStateIds: [] - manifest and locale key sets are immutable parser allowlists.
import { createEffectBundleFailure, type EffectBundleFailure } from '../diagnostics';
import { findManifestCollision, parseManifestAssets, parseManifestDocuments } from './entries';
import type { EffectBundleLocalizedText, EffectBundleManifest } from './types';
import { hasExactKeys, isRecord } from '../validation';

export type * from './types';

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const MANIFEST_KEYS = new Set([
  'assets',
  'description',
  'effectDocuments',
  'engineVersion',
  'label',
  'manifestVersion',
  'packId',
  'version',
]);
const LOCALIZED_TEXT_KEYS = new Set(['en', 'ru']);

type ParseEffectBundleManifestResult =
  | { manifest: EffectBundleManifest; ok: true }
  | EffectBundleFailure;

export function parseEffectBundleManifest(input: unknown): ParseEffectBundleManifestResult {
  if (!isRecord(input) || !hasExactKeys(input, MANIFEST_KEYS, ['description'])) {
    return createEffectBundleFailure('BUNDLE_MANIFEST_INVALID', '$manifest');
  }
  if (input['engineVersion'] !== '2.0') {
    return createEffectBundleFailure('BUNDLE_ENGINE_UNSUPPORTED', '$.engineVersion');
  }
  if (
    input['manifestVersion'] !== 'sniptale.bundle.v1' ||
    !isIdentifier(input['packId']) ||
    typeof input['version'] !== 'string' ||
    !isSemanticVersion(input['version'])
  ) {
    return createEffectBundleFailure('BUNDLE_MANIFEST_INVALID', '$manifest');
  }
  const label = parseLocalizedText(input['label']);
  const description =
    input['description'] === undefined ? undefined : parseLocalizedText(input['description']);
  if (!label || (input['description'] !== undefined && !description)) {
    return createEffectBundleFailure('BUNDLE_MANIFEST_INVALID', '$.label');
  }
  const documents = parseManifestDocuments(input['effectDocuments']);
  if (!documents.ok) return documents;
  const assets = parseManifestAssets(input['assets']);
  if (!assets.ok) return assets;
  const collision = findManifestCollision(documents.value, assets.value);
  if (collision) {
    return createEffectBundleFailure('BUNDLE_ENTRY_COLLISION', collision);
  }
  return {
    manifest: {
      assets: assets.value,
      ...(description ? { description } : {}),
      effectDocuments: documents.value,
      engineVersion: '2.0',
      label,
      manifestVersion: 'sniptale.bundle.v1',
      packId: input['packId'],
      version: input['version'],
    },
    ok: true,
  };
}

function parseLocalizedText(value: unknown): EffectBundleLocalizedText | null {
  if (!isRecord(value) || !hasExactKeys(value, LOCALIZED_TEXT_KEYS)) return null;
  const en = value['en'];
  const ru = value['ru'];
  return typeof en === 'string' &&
    typeof ru === 'string' &&
    en.trim().length > 0 &&
    ru.trim().length > 0 &&
    en.length <= 4096 &&
    ru.length <= 4096
    ? { en, ru }
    : null;
}

function isIdentifier(value: unknown): value is string {
  return typeof value === 'string' && IDENTIFIER.test(value);
}

function isSemanticVersion(value: string): boolean {
  if (value.length === 0 || value.length > 128) return false;
  const buildStart = value.indexOf('+');
  if (buildStart !== -1 && value.indexOf('+', buildStart + 1) !== -1) return false;
  const beforeBuild = buildStart === -1 ? value : value.slice(0, buildStart);
  const build = buildStart === -1 ? null : value.slice(buildStart + 1);
  const prereleaseStart = beforeBuild.indexOf('-');
  const core = prereleaseStart === -1 ? beforeBuild : beforeBuild.slice(0, prereleaseStart);
  const prerelease = prereleaseStart === -1 ? null : beforeBuild.slice(prereleaseStart + 1);
  const coreParts = core.split('.');
  return (
    coreParts.length === 3 &&
    coreParts.every(isCanonicalVersionNumber) &&
    (prerelease === null || isSemanticVersionSuffix(prerelease)) &&
    (build === null || isSemanticVersionSuffix(build))
  );
}

function isCanonicalVersionNumber(value: string): boolean {
  return (
    value.length > 0 &&
    (value === '0' || value[0] !== '0') &&
    [...value].every((character) => character >= '0' && character <= '9')
  );
}

function isSemanticVersionSuffix(value: string): boolean {
  return (
    value.length > 0 &&
    [...value].every(
      (character) =>
        (character >= '0' && character <= '9') ||
        (character >= 'A' && character <= 'Z') ||
        (character >= 'a' && character <= 'z') ||
        character === '.' ||
        character === '-'
    )
  );
}
