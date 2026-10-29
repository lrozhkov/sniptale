import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { parseConnectionBinding, type SyncConnectionBinding } from '../remote-connection/model';
import type { CaptureRootKind } from '../sync-capture/contracts';
import type { AssetRef } from './contracts';
import { parseAssetRef } from './guards';

export type AssetResidencyTarget =
  | { kind: 'opfs'; ref: AssetRef }
  | {
      kind: 'inline-image';
      mediaId: string;
      createdAt: number;
      workspaceRevision: number;
      rootGeneration: number;
      nativeDigest: string;
      size: number;
      mimeType: string;
      blobType: string;
      duplicatePreview?: { presentationRevision: number; blobType: string };
    };
export interface AssetResidencyRemote {
  binding: SyncConnectionBinding;
  key: string;
  sha256: string;
}
export interface AssetResidencyCopy {
  version: 1;
  kind: 'copy';
  id: string;
  revision: number;
  operationId: string;
  phase: 'resident' | 'unloading' | 'unloaded';
  target: AssetResidencyTarget;
  remote: AssetResidencyRemote;
  lastUsedAt: number;
}
export interface AssetResidencyRoot {
  version: 1;
  kind: 'root';
  id: string;
  revision: number;
  rootKind: CaptureRootKind;
  rootId: string;
  pinned: boolean;
  lastUsedAt: number;
}
export interface AssetResidencySettings {
  version: 1;
  kind: 'settings';
  id: 'settings';
  revision: number;
  budgetBytes: number;
}
export type AssetResidencyRecord = AssetResidencyCopy | AssetResidencyRoot | AssetResidencySettings;
export const DEFAULT_ASSET_RESIDENCY_BUDGET_BYTES = 1024 * 1024 * 1024;

function exact(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return (
    Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key))
  );
}
function text(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 4096 &&
    Array.from(value).every(
      (character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127
    )
  );
}
function ordinal(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
function digest(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
}
function rootKind(value: unknown): value is CaptureRootKind {
  return (
    value === 'media' ||
    value === 'video-project' ||
    value === 'video-review' ||
    value === 'scenario-project'
  );
}

/** Copy identity follows native identity; exact source descriptors remain in the checked record. */
export function assetResidencyCopyId(
  target:
    | { kind: 'opfs'; ref: Pick<AssetRef, 'assetId'> }
    | { kind: 'inline-image'; mediaId: string }
): string {
  return JSON.stringify([
    'copy',
    target.kind,
    target.kind === 'opfs' ? target.ref.assetId : target.mediaId,
  ]);
}
/** Root pin intent survives changes to the root's current editing closure. */
export function assetResidencyRootId(kind: CaptureRootKind, rootId: string): string {
  return JSON.stringify(['root', kind, rootId]);
}

/** Parse a closed native physical descriptor without retaining Blob values or caller references. */
function parseAssetResidencyTarget(value: unknown): AssetResidencyTarget | null {
  if (!isRecord(value)) return null;
  if (value['kind'] === 'opfs') {
    const raw = value['ref'];
    if (
      !exact(value, ['kind', 'ref']) ||
      !isRecord(raw) ||
      !exact(raw, ['assetId', 'createdAt', 'location', 'mimeType', 'sha256', 'size']) ||
      !isRecord(raw['location']) ||
      !exact(raw['location'], ['kind', 'objectKey'])
    )
      return null;
    const ref = parseAssetRef(raw);
    return ref ? { kind: 'opfs', ref } : null;
  }
  if (
    value['kind'] !== 'inline-image' ||
    !exact(value, [
      'kind',
      'mediaId',
      'createdAt',
      'workspaceRevision',
      'rootGeneration',
      'nativeDigest',
      'size',
      'mimeType',
      'blobType',
      ...(Object.hasOwn(value, 'duplicatePreview') ? ['duplicatePreview'] : []),
    ]) ||
    !text(value['mediaId']) ||
    !ordinal(value['createdAt']) ||
    !ordinal(value['workspaceRevision']) ||
    !ordinal(value['rootGeneration']) ||
    !digest(value['nativeDigest']) ||
    !ordinal(value['size']) ||
    !text(value['mimeType']) ||
    typeof value['blobType'] !== 'string' ||
    value['blobType'].length > 256
  )
    return null;
  let duplicatePreview: { presentationRevision: number; blobType: string } | undefined;
  if (Object.hasOwn(value, 'duplicatePreview')) {
    const preview = value['duplicatePreview'];
    if (
      !isRecord(preview) ||
      !exact(preview, ['presentationRevision', 'blobType']) ||
      !ordinal(preview['presentationRevision']) ||
      typeof preview['blobType'] !== 'string' ||
      preview['blobType'].length > 256
    )
      return null;
    duplicatePreview = {
      presentationRevision: preview['presentationRevision'],
      blobType: preview['blobType'],
    };
  }
  return {
    kind: 'inline-image',
    mediaId: value['mediaId'],
    createdAt: value['createdAt'],
    workspaceRevision: value['workspaceRevision'],
    rootGeneration: value['rootGeneration'],
    nativeDigest: value['nativeDigest'],
    size: value['size'],
    mimeType: value['mimeType'],
    blobType: value['blobType'],
    ...(duplicatePreview ? { duplicatePreview } : {}),
  };
}

function parseRemote(value: unknown): AssetResidencyRemote | null {
  if (
    !isRecord(value) ||
    !exact(value, ['binding', 'key', 'sha256']) ||
    !text(value['key']) ||
    !digest(value['sha256'])
  )
    return null;
  // The transport encodes path segments. Retain ordinary decoded DAV names here.
  if (
    value['key'].length > 2048 ||
    /[\\?#:]/u.test(value['key']) ||
    !value['key'].split('/').every((part) => part !== '' && part !== '.' && part !== '..')
  )
    return null;
  const binding = parseConnectionBinding(value['binding']);
  return binding ? { binding, key: value['key'], sha256: value['sha256'] } : null;
}

/** Authoritative malformed retained metadata is refused; this parser never repairs it. */
export function parseAssetResidencyRecord(value: unknown): AssetResidencyRecord | null {
  if (
    !isRecord(value) ||
    value['version'] !== 1 ||
    typeof value['id'] !== 'string' ||
    !ordinal(value['revision'])
  )
    return null;
  if (value['kind'] === 'settings') {
    if (
      !exact(value, ['version', 'kind', 'id', 'revision', 'budgetBytes']) ||
      value['id'] !== 'settings' ||
      !ordinal(value['budgetBytes'])
    )
      return null;
    return {
      version: 1,
      kind: 'settings',
      id: 'settings',
      revision: value['revision'],
      budgetBytes: value['budgetBytes'],
    };
  }
  if (value['revision'] < 1 || !ordinal(value['lastUsedAt'])) return null;
  if (value['kind'] === 'root') {
    if (
      !exact(value, [
        'version',
        'kind',
        'id',
        'revision',
        'rootKind',
        'rootId',
        'pinned',
        'lastUsedAt',
      ]) ||
      !rootKind(value['rootKind']) ||
      !text(value['rootId']) ||
      typeof value['pinned'] !== 'boolean' ||
      value['id'] !== assetResidencyRootId(value['rootKind'], value['rootId'])
    )
      return null;
    return {
      version: 1,
      kind: 'root',
      id: value['id'],
      revision: value['revision'],
      rootKind: value['rootKind'],
      rootId: value['rootId'],
      pinned: value['pinned'],
      lastUsedAt: value['lastUsedAt'],
    };
  }
  if (
    value['kind'] !== 'copy' ||
    !exact(value, [
      'version',
      'kind',
      'id',
      'revision',
      'operationId',
      'phase',
      'target',
      'remote',
      'lastUsedAt',
    ]) ||
    !text(value['operationId']) ||
    (value['phase'] !== 'resident' &&
      value['phase'] !== 'unloading' &&
      value['phase'] !== 'unloaded')
  )
    return null;
  const target = parseAssetResidencyTarget(value['target']);
  const remote = parseRemote(value['remote']);
  if (
    !target ||
    !remote ||
    value['id'] !== assetResidencyCopyId(target) ||
    (target.kind === 'opfs' && target.ref.sha256 !== null && target.ref.sha256 !== remote.sha256)
  )
    return null;
  return {
    version: 1,
    kind: 'copy',
    id: value['id'],
    revision: value['revision'],
    operationId: value['operationId'],
    phase: value['phase'],
    target,
    remote,
    lastUsedAt: value['lastUsedAt'],
  };
}
