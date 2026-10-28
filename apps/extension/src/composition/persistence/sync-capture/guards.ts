import { describeImageMetadata, parseCapturedImageRows } from './image-snapshot';
export { parseCapturedImageRows } from './image-snapshot';
import { sha256 } from '@noble/hashes/sha2.js';
import type { MediaLibraryEntry } from '../media-library/contracts';
import type { VideoProject } from '../../../features/video/project/types';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { parseAssetRef } from '../assets/guards';
import { parseMediaLibraryEntry } from '../media-library/read-guards';
import {
  parseProjectAssetEntry,
  parseProjectExportEntry,
  parseVideoProjectEntry,
} from '../projects/read-guards';
import {
  captureRootKey,
  MAX_CAPTURE_METADATA_BYTES,
  MAX_CAPTURE_ROWS,
  type CapturedVideoProjectRows,
  type CapturedMediaRows,
  type CapturedMediaDependency,
  type CapturedChange,
  type CaptureOperation,
  type CaptureOperationHeader,
  type PreparedCaptureOperation,
  type PublishedCaptureOperation,
  type SyncCaptureAppliedOperation,
  type SyncCaptureProfile,
  type SyncCaptureRootState,
  type SyncCaptureRecord,
} from './contracts';

function identity(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 256;
}

function storageKey(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 2048;
}

function ordinal(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function parseRows<T>(value: unknown, parse: (row: unknown) => T | null): T[] | null {
  if (!Array.isArray(value) || value.length > MAX_CAPTURE_ROWS) return null;
  const rows: unknown[] = value;
  const parsed = rows.map(parse);
  return parsed.some((row) => row === null) ? null : parsed.filter((row) => row !== null);
}

/** The experiment has no capture owners for these additional project resources. */
export function isSupportedCaptureProject(project: VideoProject): boolean {
  if (
    project.source.kind !== 'manual' ||
    project.baseRecordingId !== null ||
    project.cursorTrack !== null ||
    project.watermarkSource !== undefined ||
    project.bookendPresets !== undefined ||
    project.watermark?.image !== undefined ||
    project.sceneBackground?.kind === 'image' ||
    project.sceneBackground?.remembered?.image !== undefined
  )
    return false;
  if (
    [
      project.effectInstances,
      project.effectSnapshots,
      project.sourceVoiceoverDocuments,
      project.sourceAudioDocuments,
      project.commentDocuments,
      project.textDocuments,
      project.objectTracks,
      project.motionRegions,
      project.actionFeedback,
      project.actionEvents,
    ].some((rows) => rows !== undefined && rows.length > 0)
  )
    return false;
  const ids = new Set(project.assets.map((asset) => asset.id));
  return (
    project.assets.length <= MAX_CAPTURE_ROWS &&
    ids.size === project.assets.length &&
    project.assets.every(
      (asset) =>
        !asset.recordingPart &&
        asset.type !== 'RECORDING' &&
        (asset.source.kind === 'library-asset' ||
          (asset.source.kind === 'project-asset' && !asset.source.originRecordingId))
    ) &&
    project.clips.every(
      (clip) =>
        (clip.type === 'VIDEO' || clip.type === 'AUDIO' || clip.type === 'IMAGE') &&
        ids.has(clip.assetId)
    )
  );
}

/** Reject binary, cyclic, or excessive metadata before any JSON size calculation. */
function boundedMetadata(value: unknown): boolean {
  const active = new WeakSet<object>();
  let nodes = 0;
  let characters = 0;
  function visit(item: unknown, depth: number): boolean {
    if (++nodes > 100_000 || depth > 64) return false;
    if (typeof item === 'string') {
      characters += item.length;
      return characters <= MAX_CAPTURE_METADATA_BYTES;
    }
    if (item === undefined || item === null || typeof item === 'boolean') return true;
    if (typeof item === 'number') return Number.isFinite(item);
    if (typeof item !== 'object' || active.has(item)) return false;
    if (
      !Array.isArray(item) &&
      Object.getPrototypeOf(item) !== Object.prototype &&
      Object.getPrototypeOf(item) !== null
    )
      return false;
    active.add(item);
    const valid = Object.entries(item).every(([key, child]) => {
      characters += key.length;
      return characters <= MAX_CAPTURE_METADATA_BYTES && visit(child, depth + 1);
    });
    active.delete(item);
    return valid;
  }
  return (
    visit(value, 0) &&
    new TextEncoder().encode(JSON.stringify(value)).byteLength <= MAX_CAPTURE_METADATA_BYTES
  );
}

/** Admit the original-only Library mirror that the native project asset publisher owns. */
export function parseCapturedMediaRows(value: unknown): CapturedMediaRows | null {
  if (!isRecord(value) || !boundedMetadata(value)) return null;
  const media = parseMediaLibraryEntry(value['media']);
  const projectAsset = parseProjectAssetEntry(value['projectAsset']);
  const ref = parseAssetRef(value['ref']);
  if (!media || !projectAsset || !ref) return null;
  const rows = { media, projectAsset, ref };
  return isOriginalOnlyCapturedMedia(media) && hasExactMediaSourceBinding(rows) ? rows : null;
}

/** The bounded source revision does not describe editable workspaces or inline bytes. */
function isOriginalOnlyCapturedMedia(media: MediaLibraryEntry): boolean {
  return (
    media.blob === undefined &&
    media.recordingMetadata === undefined &&
    media.recordingGroup === undefined &&
    media.workspaceRevision === 0 &&
    media.imageContentState !== 'edited' &&
    media.lifecycle?.trashedAt === undefined
  );
}

/** A Library mirror, its native child, and its immutable ref must describe one source. */
function hasExactMediaSourceBinding({ media, projectAsset, ref }: CapturedMediaRows): boolean {
  return (
    projectAsset.originMediaId === undefined &&
    media.source.kind === 'project-asset' &&
    media.source.projectAssetId === projectAsset.id &&
    media.id === `project-asset:${projectAsset.id}` &&
    projectAsset.assetId === ref.assetId &&
    media.size === ref.size &&
    projectAsset.size === ref.size &&
    media.mimeType === ref.mimeType &&
    projectAsset.mimeType === ref.mimeType
  );
}

function parseMediaDependencies(value: unknown): CapturedMediaDependency[] | null {
  return parseRows(value, (item) => {
    if (
      !isRecord(item) ||
      !identity(item['mediaId']) ||
      !ordinal(item['generation']) ||
      item['generation'] === 0 ||
      !Array.isArray(item['basis']) ||
      item['basis'].length === 0 ||
      item['basis'].length > MAX_CAPTURE_ROWS ||
      !item['basis'].every(identity) ||
      new Set(item['basis']).size !== item['basis'].length
    )
      return null;
    return { mediaId: item['mediaId'], generation: item['generation'], basis: item['basis'] };
  });
}

/** Parse accepted native rows again when they cross the persistence boundary. */
export function parseCapturedVideoProjectRows(value: unknown): CapturedVideoProjectRows | null {
  if (!isRecord(value) || !boundedMetadata(value)) return null;
  const project = parseVideoProjectEntry(value['project']);
  const assets = parseRows(value['assets'], parseProjectAssetEntry);
  const exports = parseRows(value['exports'], parseProjectExportEntry);
  const media = parseRows(value['media'], parseMediaLibraryEntry);
  const refs = parseRows(value['refs'], parseAssetRef);
  if (!project || !assets || !exports || !media || !refs || media.some((row) => row.blob))
    return null;
  for (const rows of [assets, exports, media]) {
    if (new Set(rows.map((row) => row.id)).size !== rows.length) return null;
  }
  if (new Set(refs.map((ref) => ref.assetId)).size !== refs.length) return null;
  const resources = new Map(refs.map((ref) => [ref.assetId, ref]));
  if (
    [...assets, ...exports].some((entry) => {
      const ref = resources.get(entry.assetId);
      return (
        !ref ||
        ref.size !== entry.size ||
        (entry.mimeType !== undefined && ref.mimeType !== entry.mimeType)
      );
    }) ||
    exports.some((entry) => entry.projectId !== project.id)
  )
    return null;
  const dependencies =
    value['mediaDependencies'] === undefined
      ? undefined
      : parseMediaDependencies(value['mediaDependencies']);
  if (dependencies === null) return null;
  if (dependencies !== undefined) {
    const dependencyIds = new Set(dependencies.map((row) => row.mediaId));
    const editingMedia = media.filter((row) => row.source.kind !== 'project-export');
    if (
      dependencyIds.size !== dependencies.length ||
      dependencyIds.size !== editingMedia.length ||
      editingMedia.some((row) => !dependencyIds.has(row.id))
    )
      return null;
  }
  const parsed = {
    project,
    assets,
    exports,
    media,
    refs,
    ...(dependencies === undefined ? {} : { mediaDependencies: dependencies }),
  };
  if (!isSupportedCaptureProject(project.project) || !completeCapturedGraph(parsed)) return null;
  if (new TextEncoder().encode(JSON.stringify(parsed)).byteLength > MAX_CAPTURE_METADATA_BYTES)
    return null;
  return parsed;
}

/** Resolve the full admitted dependency closure; do not silently discard missing rows. */
function completeCapturedGraph(rows: CapturedVideoProjectRows): boolean {
  const closure = new CapturedProjectClosure(rows);
  return closure.admitProjectSources() && closure.admitExports() && closure.resolveDependencies();
}

class CapturedProjectClosure {
  private readonly assets;
  private readonly media;
  private readonly exports;
  private readonly refs;
  private readonly neededAssets = new Set<string>();
  private readonly neededMedia = new Set<string>();
  private readonly neededRefs = new Set<string>();

  constructor(private readonly rows: CapturedVideoProjectRows) {
    this.assets = new Map(rows.assets.map((entry) => [entry.id, entry]));
    this.media = new Map(rows.media.map((entry) => [entry.id, entry]));
    this.exports = new Map(rows.exports.map((entry) => [entry.id, entry]));
    this.refs = new Map(rows.refs.map((entry) => [entry.assetId, entry]));
  }

  admitProjectSources(): boolean {
    for (const asset of this.rows.project.project.assets) {
      const source = asset.source;
      const resource =
        source.kind === 'project-asset'
          ? this.assets.get(source.projectAssetId)
          : source.kind === 'library-asset'
            ? this.media.get(source.mediaId)
            : undefined;
      if (
        !resource ||
        resource.size !== asset.metadata.size ||
        resource.mimeType !== asset.metadata.mimeType
      )
        return false;
      if (source.kind === 'project-asset') {
        this.neededAssets.add(source.projectAssetId);
        if (source.originMediaId) this.neededMedia.add(source.originMediaId);
      } else if (source.kind === 'library-asset') this.neededMedia.add(source.mediaId);
    }
    return true;
  }

  admitExports(): boolean {
    for (const entry of this.rows.exports) {
      if (!entry.mimeType || entry.recordingMetadata) return false;
      this.neededRefs.add(entry.assetId);
      if (this.media.has(`export:${entry.id}`)) this.neededMedia.add(`export:${entry.id}`);
    }
    return true;
  }

  resolveDependencies(): boolean {
    // Growing sets traverse cycles once; input row limits bound the work.
    let assetOffset = 0;
    let mediaOffset = 0;
    while (assetOffset < this.neededAssets.size || mediaOffset < this.neededMedia.size) {
      const assetIds = [...this.neededAssets];
      for (; assetOffset < assetIds.length; assetOffset++) {
        if (!this.admitProjectAsset(assetIds[assetOffset]!)) return false;
      }
      const mediaIds = [...this.neededMedia];
      for (; mediaOffset < mediaIds.length; mediaOffset++) {
        if (!this.admitMedia(mediaIds[mediaOffset]!)) return false;
      }
    }
    return (
      this.neededAssets.size === this.assets.size &&
      this.neededMedia.size === this.media.size &&
      this.neededRefs.size === this.refs.size &&
      [...this.neededRefs].every((id) => this.refs.has(id))
    );
  }

  private admitProjectAsset(id: string): boolean {
    const entry = this.assets.get(id);
    if (!entry) return false;
    this.neededRefs.add(entry.assetId);
    if (entry.originMediaId) this.neededMedia.add(entry.originMediaId);
    if (this.media.has(`project-asset:${entry.id}`))
      this.neededMedia.add(`project-asset:${entry.id}`);
    return true;
  }

  private admitMedia(id: string): boolean {
    const entry = this.media.get(id);
    if (!entry || entry.recordingMetadata || entry.recordingGroup) return false;
    const source = entry.source;
    switch (source.kind) {
      case 'project-asset': {
        const target = this.assets.get(source.projectAssetId);
        if (!target || entry.size !== target.size || entry.mimeType !== target.mimeType)
          return false;
        if (
          entry.id.startsWith('project-asset:') &&
          entry.id !== `project-asset:${source.projectAssetId}`
        )
          return false;
        this.neededAssets.add(source.projectAssetId);
        return true;
      }
      case 'project-export': {
        const target = this.exports.get(source.exportId);
        return (
          target !== undefined &&
          entry.size === target.size &&
          entry.mimeType === target.mimeType &&
          source.projectId === this.rows.project.id &&
          (!entry.id.startsWith('export:') || entry.id === `export:${source.exportId}`)
        );
      }
      case 'stored-asset': {
        const target = this.refs.get(source.assetId);
        if (!target || entry.size !== target.size || entry.mimeType !== target.mimeType)
          return false;
        this.neededRefs.add(source.assetId);
        return true;
      }
      case 'recording':
      case 'screenshot':
      case 'web-snapshot':
        return false;
    }
  }
}

type CaptureRecordHeader = Pick<SyncCaptureRecord, 'version' | 'key' | 'createdAt' | 'spaceId'>;
type CaptureRoot = Pick<
  SyncCaptureRootState,
  'rootKind' | 'rootId' | 'rootKey' | 'generation' | 'basis'
>;

function parseCaptureHeader(value: Record<string, unknown>): CaptureRecordHeader | null {
  if (
    value['version'] !== 1 ||
    !storageKey(value['key']) ||
    !ordinal(value['createdAt']) ||
    !identity(value['spaceId'])
  )
    return null;
  return {
    version: 1,
    key: value['key'],
    createdAt: value['createdAt'],
    spaceId: value['spaceId'],
  };
}

function parseCaptureProfile(
  value: Record<string, unknown>,
  header: CaptureRecordHeader
): SyncCaptureProfile | null {
  if (
    value['key'] !== 'profile' ||
    typeof value['enabled'] !== 'boolean' ||
    !ordinal(value['connectionGeneration']) ||
    value['connectionGeneration'] === 0
  )
    return null;
  return {
    ...header,
    kind: 'profile',
    key: 'profile',
    enabled: value['enabled'],
    connectionGeneration: value['connectionGeneration'],
  };
}

function parseAppliedOperation(
  value: Record<string, unknown>,
  header: CaptureRecordHeader
): SyncCaptureAppliedOperation | null {
  if (
    !storageKey(value['rootKey']) ||
    !ordinal(value['generation']) ||
    value['generation'] === 0 ||
    !identity(value['operationId']) ||
    typeof value['sourceDigest'] !== 'string' ||
    !/^[a-f0-9]{64}$/u.test(value['sourceDigest'])
  )
    return null;
  return {
    ...header,
    kind: 'applied-operation',
    rootKey: value['rootKey'],
    generation: value['generation'],
    operationId: value['operationId'],
    sourceDigest: value['sourceDigest'],
  };
}

function parseCaptureRoot(
  value: Record<string, unknown>,
  header: CaptureRecordHeader
): CaptureRoot | null {
  if (
    !storageKey(value['rootKey']) ||
    !ordinal(value['generation']) ||
    value['generation'] === 0 ||
    (value['rootKind'] !== 'video-project' && value['rootKind'] !== 'media') ||
    !identity(value['rootId']) ||
    captureRootKey(header.spaceId, value['rootKind'], value['rootId']) !== value['rootKey'] ||
    !Array.isArray(value['basis']) ||
    value['basis'].length > MAX_CAPTURE_ROWS
  )
    return null;
  const basis: unknown[] = value['basis'];
  if (!basis.every(identity) || new Set(basis).size !== basis.length) return null;
  return {
    rootKind: value['rootKind'],
    rootId: value['rootId'],
    rootKey: value['rootKey'],
    generation: value['generation'],
    basis,
  };
}

/** Fingerprint normalized native input independently of object property order. */
export function fingerprintNativeCapture(value: Omit<CapturedChange, 'sourceSha256'>): string {
  const canonical = (item: unknown): unknown => {
    if (item instanceof Blob) return describeImageMetadata(item);
    if (Array.isArray(item)) return item.map(canonical);
    if (isRecord(item))
      return Object.fromEntries(
        Object.keys(item)
          .sort()
          .map((key) => [key, canonical(item[key])])
      );
    return item;
  };
  const change = value.change;
  const normalizedChange =
    change.kind === 'media'
      ? { kind: change.kind, rows: parseCapturedMediaRows(change.rows) ?? change.rows }
      : change.kind === 'image'
        ? { kind: change.kind, rows: parseCapturedImageRows(change.rows) ?? change.rows }
        : change.kind === 'video-project'
          ? { kind: change.kind, rows: parseCapturedVideoProjectRows(change.rows) ?? change.rows }
          : change;
  return hashCaptureText(
    JSON.stringify(
      canonical(
        Object.fromEntries(
          Object.entries({ ...value, change: normalizedChange }).filter(
            ([key]) => key !== 'sourceSha256'
          )
        )
      )
    )
  );
}

export function hashCaptureText(text: string): string {
  return Array.from(sha256(new TextEncoder().encode(text)), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('');
}
function captureDigest(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
}
function captureRemoteKey(value: unknown): value is string {
  return (
    storageKey(value) &&
    !/[\\?#:]/u.test(value) &&
    Array.from(value).every(
      (character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127
    ) &&
    value.split('/').every((part) => part !== '' && part !== '.' && part !== '..')
  );
}
/** Validate actual immutable portable object bindings without adding phase-specific fields. */
export function parseCaptureObjectBindings(
  value: unknown
): PreparedCaptureOperation['prepared']['objects'] | null {
  if (!Array.isArray(value) || value.length > MAX_CAPTURE_ROWS * 2) return null;
  const objects: PreparedCaptureOperation['prepared']['objects'] = [];
  for (const item of value) {
    if (!isRecord(item)) return null;
    const ref = parseAssetRef(item['ref']);
    if (
      !ref ||
      !identity(item['objectId']) ||
      !captureDigest(item['sha256']) ||
      (ref.sha256 !== null && ref.sha256 !== item['sha256']) ||
      !storageKey(item['filename'])
    )
      return null;
    objects.push({
      objectId: item['objectId'],
      ref,
      sha256: item['sha256'],
      filename: item['filename'],
    });
  }
  return new Set(objects.map((item) => item.objectId)).size === objects.length ? objects : null;
}
function parsePublishedObjects(value: unknown): PublishedCaptureOperation['objects'] | null {
  const bindings = parseCaptureObjectBindings(value);
  if (!bindings || !Array.isArray(value)) return null;
  const objects: PublishedCaptureOperation['objects'] = [];
  for (const [index, binding] of bindings.entries()) {
    const item: unknown = value[index];
    if (
      !isRecord(item) ||
      !captureRemoteKey(item['remoteKey']) ||
      typeof item['pinned'] !== 'boolean'
    )
      return null;
    objects.push({ ...binding, remoteKey: item['remoteKey'], pinned: item['pinned'] });
  }
  return new Set(objects.map((item) => item.remoteKey)).size === objects.length ? objects : null;
}
function parseCapturedChange(
  value: Record<string, unknown>,
  header: CaptureRecordHeader
): CaptureOperation | null {
  const root = parseCaptureRoot(value, header);
  const source = value['source'];
  if (
    !root ||
    !identity(value['operationId']) ||
    !ordinal(value['connectionGeneration']) ||
    value['connectionGeneration'] === 0 ||
    !ordinal(value['profileCreatedAt']) ||
    !captureDigest(value['sourceSha256']) ||
    (value['origin'] !== 'local-edit' && value['origin'] !== 'local-restore') ||
    !(value['publicationId'] === null || identity(value['publicationId'])) ||
    !isRecord(source) ||
    (source['changeKind'] !== 'image' &&
      source['changeKind'] !== 'media' &&
      source['changeKind'] !== 'video-project' &&
      source['changeKind'] !== 'tombstone') ||
    typeof source['label'] !== 'string' ||
    source['label'].length === 0 ||
    source['label'].length > MAX_CAPTURE_METADATA_BYTES
  )
    return null;
  const stable: CaptureOperationHeader = {
    ...header,
    ...root,
    kind: 'sync-operation',
    profileCreatedAt: value['profileCreatedAt'],
    sourceSha256: value['sourceSha256'],
    source: { changeKind: source['changeKind'], label: source['label'] },
    operationId: value['operationId'],
    connectionGeneration: value['connectionGeneration'],
    origin: value['origin'],
    publicationId: value['publicationId'],
  };
  if (value['phase'] === 'native') {
    if ('prepared' in value || 'publication' in value || 'objects' in value) return null;
    const change = value['change'];
    if (!isRecord(change)) return null;
    const rows =
      change['kind'] === 'video-project' ? parseCapturedVideoProjectRows(change['rows']) : null;
    const mediaRows = change['kind'] === 'media' ? parseCapturedMediaRows(change['rows']) : null;
    const imageRows = change['kind'] === 'image' ? parseCapturedImageRows(change['rows']) : null;
    let parsedChange: CapturedChange['change'];
    if (change['kind'] === 'tombstone') parsedChange = { kind: 'tombstone' };
    else if (rows && rows.project.id === root.rootId && root.rootKind === 'video-project')
      parsedChange = { kind: 'video-project', rows };
    else if (mediaRows && mediaRows.media.id === root.rootId && root.rootKind === 'media')
      parsedChange = { kind: 'media', rows: mediaRows };
    else if (imageRows && imageRows.media.id === root.rootId && root.rootKind === 'media')
      parsedChange = { kind: 'image', rows: imageRows };
    else return null;
    const native: CapturedChange = { ...stable, phase: 'native', change: parsedChange };
    return native.source.changeKind === parsedChange.kind &&
      fingerprintNativeCapture(native) === native.sourceSha256
      ? native
      : null;
  }
  if (value['phase'] === 'prepared') {
    if ('change' in value || 'publication' in value || 'objects' in value) return null;
    const prepared = value['prepared'];
    if (
      !isRecord(prepared) ||
      typeof prepared['recordText'] !== 'string' ||
      new TextEncoder().encode(prepared['recordText']).byteLength > 4 * 1024 * 1024 ||
      !captureDigest(prepared['recordSha256']) ||
      hashCaptureText(prepared['recordText']) !== prepared['recordSha256'] ||
      !Array.isArray(prepared['objects'])
    )
      return null;
    const objects = parseCaptureObjectBindings(prepared['objects']);
    if (!objects) return null;
    return {
      ...stable,
      phase: 'prepared',
      prepared: {
        recordText: prepared['recordText'],
        recordSha256: prepared['recordSha256'],
        objects,
      },
    };
  }
  if (value['phase'] === 'published') {
    if ('change' in value || 'prepared' in value) return null;
    const fact = value['publication'];
    const objects = parsePublishedObjects(value['objects']);
    if (
      !objects ||
      !isRecord(fact) ||
      (fact['kind'] !== 'verified' && fact['kind'] !== 'observed') ||
      !ordinal(fact['acceptedAt']) ||
      !captureDigest(fact['preparedSha256']) ||
      typeof fact['attemptId'] !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(fact['attemptId']) ||
      !captureRemoteKey(fact['recordKey']) ||
      !captureDigest(fact['recordSha256'])
    )
      return null;
    return {
      ...stable,
      phase: 'published',
      publication: {
        kind: fact['kind'],
        acceptedAt: fact['acceptedAt'],
        preparedSha256: fact['preparedSha256'],
        attemptId: fact['attemptId'],
        recordKey: fact['recordKey'],
        recordSha256: fact['recordSha256'],
      },
      objects,
    };
  }
  return null;
}

/** Legacy root states have no native digest; new media states retain their admitted fingerprint. */
function parseCaptureRootState(
  value: Record<string, unknown>,
  header: CaptureRecordHeader
): SyncCaptureRootState | null {
  const root = parseCaptureRoot(value, header);
  if (!root) return null;
  const nativeDigest = value['nativeDigest'];
  const nativeRevision = value['nativeRevision'];
  if (nativeRevision !== undefined && (!ordinal(nativeRevision) || root.rootKind !== 'media'))
    return null;
  const deleted = value['deleted'];
  if (deleted !== undefined && deleted !== true) return null;
  if (deleted === true && nativeDigest !== undefined) return null;
  if (
    nativeDigest !== undefined &&
    (typeof nativeDigest !== 'string' ||
      !/^[a-f0-9]{64}$/u.test(nativeDigest) ||
      root.rootKind !== 'media')
  )
    return null;
  return {
    ...header,
    ...root,
    kind: 'root-state',
    ...(nativeDigest === undefined ? {} : { nativeDigest }),
    ...(nativeRevision === undefined ? {} : { nativeRevision }),
    ...(deleted === true ? { deleted: true } : {}),
  };
}

/** Unknown or malformed capture data refuses mutation and physical cleanup. */
export function parseSyncCaptureRecord(value: unknown): SyncCaptureRecord | null {
  if (!isRecord(value)) return null;
  const header = parseCaptureHeader(value);
  if (!header) return null;
  switch (value['kind']) {
    case 'profile':
      return parseCaptureProfile(value, header);
    case 'applied-operation':
      return parseAppliedOperation(value, header);
    case 'root-state':
      return parseCaptureRootState(value, header);
    case 'sync-operation':
      return parseCapturedChange(value, header);
    default:
      return null;
  }
}
