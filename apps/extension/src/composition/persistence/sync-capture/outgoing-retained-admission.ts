import type { IDBPTransaction } from 'idb';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import type { AssetRef } from '../assets/contracts';
import { parseAssetRef } from '../assets/guards';
import { assetResidencyCopyId } from '../assets/residency-records';
import { readAssetResidencyCopyInTransaction } from '../assets/residency';
import { ASSET_REFS_STORE } from '../infrastructure/indexed-db/core.stores';
import { parseSyncConnectionIdentity } from '../remote-connection/model';
import { checkSyncConnectionAdmission } from '../remote-connection/store';
import { parseScenarioExportEntry } from '../scenario/read-guards';
import type { CapturedChange, PreparedCaptureOperation } from './contracts';

function digest(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
}

function retainedSlotRefs(
  capture: CapturedChange,
  metadata: Record<string, unknown>,
  objectId: string
): AssetRef[] {
  const refused = (): never => {
    throw new Error('Native retained object slot changed.');
  };
  const refs: AssetRef[] = [];
  const records = (value: unknown): Record<string, unknown>[] =>
    Array.isArray(value) ? value.filter(isRecord) : [];
  const add = (ref: AssetRef | undefined) => {
    if (!ref) return refused();
    if (!refs.some((item) => JSON.stringify(item) === JSON.stringify(ref))) refs.push(ref);
  };
  const forbidden = (value: unknown, field = 'objectId') => {
    if (isRecord(value) && value[field] === objectId) return refused();
  };
  forbidden(metadata['thumbnail']);
  if (isRecord(metadata['presentation'])) {
    forbidden(metadata['presentation'], 'thumbnailObjectId');
    forbidden(metadata['presentation'], 'previewObjectId');
  }
  if (metadata['historyObjectId'] === objectId) return refused();
  for (const row of records(metadata['exportThumbnails'])) forbidden(row['thumbnail']);
  const encodedEntry = metadata['entry'];
  if (!isRecord(encodedEntry) || encodedEntry['id'] !== capture.rootId) return refused();
  if (isRecord(encodedEntry['project']))
    for (const effect of records(encodedEntry['project']['effectSnapshots']))
      for (const asset of records(effect['assets'])) forbidden(asset);
  const document = (
    encoded: unknown,
    source: { assets: { role: string; assetId: string }[] },
    sources: readonly AssetRef[]
  ) => {
    if (!isRecord(encoded)) return;
    for (const pointer of records(encoded['assets'])) {
      if (pointer['objectId'] !== objectId) continue;
      const matching = source.assets.filter((asset) => asset.role === pointer['role']);
      if (matching.length !== 1) return refused();
      add(sources.find((ref) => ref.assetId === matching[0]!.assetId));
    }
  };
  const assets = (
    encoded: unknown,
    sources: readonly { id: string; assetId: string; size: number; mimeType?: string }[],
    sourceRefs: readonly AssetRef[]
  ) => {
    for (const row of records(encoded)) {
      forbidden(row['thumbnail']);
      if (row['objectId'] !== objectId) continue;
      const entry = row['entry'];
      if (!isRecord(entry)) return refused();
      const matching = sources.filter((source) => source.id === entry['id']);
      const source = matching[0];
      if (
        matching.length !== 1 ||
        !source ||
        entry['size'] !== source.size ||
        entry['mimeType'] !== source.mimeType
      )
        return refused();
      add(sourceRefs.find((ref) => ref.assetId === source.assetId));
    }
  };
  const mediaSource = (source: import('./contracts').CapturedMediaRows, archived = false) => {
    if (metadata['originalObjectId'] === objectId) {
      if ('webSnapshot' in source) return refused();
      const localId = archived ? capture.rootId.slice(capture.rootId.indexOf(':') + 1) : undefined;
      const portableSource = encodedEntry['source'];
      const nativeSource = source.media.source;
      if (!isRecord(portableSource) || portableSource['kind'] !== nativeSource.kind)
        return refused();
      if (
        nativeSource.kind === 'project-asset' &&
        portableSource['projectAssetId'] !== (localId ?? nativeSource.projectAssetId)
      )
        return refused();
      if (
        nativeSource.kind === 'project-export' &&
        portableSource['exportId'] !== (localId ?? nativeSource.exportId)
      )
        return refused();
      if (
        nativeSource.kind === 'recording' &&
        portableSource['recordingId'] !== (localId ?? nativeSource.recordingId)
      )
        return refused();
      const verifyChild = (
        value: unknown,
        child: { id: string; size: number; mimeType?: string }
      ) => {
        if (
          !isRecord(value) ||
          value['id'] !== (localId ?? child.id) ||
          value['size'] !== child.size ||
          value['mimeType'] !== child.mimeType
        )
          return refused();
      };
      if ('projectAsset' in source) verifyChild(metadata['projectAsset'], source.projectAsset);
      if ('projectExport' in source) verifyChild(metadata['projectExport'], source.projectExport);
      if ('recording' in source)
        verifyChild(
          isRecord(metadata['recording']) ? metadata['recording']['entry'] : null,
          source.recording
        );
      add(source.ref);
    }
    if (
      'webSnapshot' in source &&
      isRecord(metadata['webSnapshot']) &&
      metadata['webSnapshot']['screenshotObjectId'] === objectId
    ) {
      const entry = metadata['webSnapshot']['entry'];
      if (!isRecord(entry) || entry['id'] !== source.webSnapshot.id) return refused();
      add(source.screenshotRef);
    }
  };
  const change = capture.change;
  if (change.kind === 'media') mediaSource(change.rows);
  else if (change.kind === 'image') {
    if (metadata['originalObjectId'] === objectId) add(change.rows.originalRef);
    if (isRecord(metadata['workspace']) && change.rows.workspace) {
      if (metadata['workspace']['aggregateId'] !== change.rows.workspace.aggregateId)
        return refused();
      document(metadata['workspace']['document'], change.rows.workspace.document, change.rows.refs);
    }
  } else if (change.kind === 'video-review') {
    mediaSource(
      change.rows.source,
      change.rows.review.workspace.aggregateId !== change.rows.source.media.id
    );
    assets(metadata['reviewAssets'], change.rows.assets, change.rows.refs);
  } else if (change.kind === 'video-project') {
    assets(metadata['projectAssets'], change.rows.assets, change.rows.refs);
    assets(metadata['projectExports'], change.rows.exports, change.rows.refs);
  } else if (change.kind === 'scenario-project') {
    assets(metadata['assets'], change.rows.assets, change.rows.refs);
    for (const encoded of records(metadata['stepDocuments'])) {
      const source = change.rows.documents.find((item) => item.stepId === encoded['stepId']);
      if (!source || encoded['projectId'] !== capture.rootId || source.projectId !== capture.rootId)
        return refused();
      document(encoded['document'], source.document, change.rows.refs);
    }
    for (const encoded of records(metadata['exports'])) {
      if (!isRecord(encoded['html']) || encoded['html']['objectId'] !== objectId) continue;
      const html = encoded['html'];
      const exported = change.rows.exports.find((item) => item.id === encoded['id']);
      const source = exported?.html
        ? change.rows.refs.find((item) => item.assetId === exported.html?.assetId)
        : undefined;
      const entry = exported?.html
        ? parseScenarioExportEntry({
            ...encoded,
            html: { mode: html['mode'], assetId: exported.html.assetId },
          })
        : null;
      if (
        Object.keys(html).length !== 2 ||
        !exported?.html ||
        !source ||
        exported.projectId !== capture.rootId ||
        source.size !== exported.size ||
        !/^text\/html(?:;charset=utf-8)?$/iu.test(source.mimeType) ||
        JSON.stringify(entry) !== JSON.stringify(exported)
      )
        return refused();
      add(source);
    }
  }
  if (!refs.length) return refused();
  return refs;
}

/** Each portable retained slot must resolve to its exact frozen native owner and current copy. */
export async function admitNativeRetainedObjects(
  tx: IDBPTransaction<unknown, string[], 'readwrite'>,
  capture: CapturedChange,
  proposed: Readonly<Pick<PreparedCaptureOperation['prepared'], 'recordText' | 'retainedObjects'>>,
  authorizationInput: unknown
): Promise<void> {
  const refused = (): never => {
    throw new Error('Native retained object evidence changed.');
  };
  const authorization = parseSyncConnectionIdentity(authorizationInput);
  if (capture.change.kind === 'tombstone' || !authorization) return refused();
  const connection = await checkSyncConnectionAdmission(tx, capture, authorization);
  if (!connection) return refused();
  let wire: unknown;
  try {
    wire = JSON.parse(proposed.recordText);
  } catch {
    return refused();
  }
  if (
    !isRecord(wire) ||
    wire['spaceId'] !== capture.spaceId ||
    wire['operationId'] !== capture.operationId ||
    wire['rootKind'] !== capture.rootKind ||
    wire['rootId'] !== capture.rootId ||
    !isRecord(wire['envelope']) ||
    !Array.isArray(wire['objects'])
  )
    return refused();
  const envelope = wire['envelope'];
  const metadata = envelope['metadata'];
  if (!isRecord(metadata) || !Array.isArray(envelope['objects'])) return refused();
  for (const binding of proposed.retainedObjects ?? []) {
    const descriptors = envelope['objects'].filter(
      (item: unknown) => isRecord(item) && item['objectId'] === binding.objectId
    );
    const digests = wire['objects'].filter(
      (item: unknown) => isRecord(item) && item['objectId'] === binding.objectId
    );
    const descriptor: unknown = descriptors[0];
    const objectDigest: unknown = digests[0];
    if (
      descriptors.length !== 1 ||
      digests.length !== 1 ||
      !isRecord(descriptor) ||
      !isRecord(objectDigest) ||
      !digest(objectDigest['sha256']) ||
      descriptor['filename'] !== binding.remoteKey.split('/').at(-1)
    )
      return refused();
    const refs = retainedSlotRefs(capture, metadata, binding.objectId);
    let matched = false;
    for (const ref of refs) {
      if (
        descriptor['size'] !== ref.size ||
        descriptor['mimeType'] !== ref.mimeType.split(';', 1)[0]!.trim().toLowerCase() ||
        (ref.sha256 !== null && ref.sha256 !== objectDigest['sha256'])
      )
        return refused();
      const copy = await readAssetResidencyCopyInTransaction(
        tx,
        assetResidencyCopyId({ kind: 'opfs', ref })
      );
      const rawRef: unknown = await tx.objectStore(ASSET_REFS_STORE).get(ref.assetId);
      if (
        (rawRef !== undefined && JSON.stringify(parseAssetRef(rawRef)) !== JSON.stringify(ref)) ||
        !copy ||
        copy.target.kind !== 'opfs' ||
        (copy.phase !== 'unloaded' && copy.phase !== 'unloading') ||
        JSON.stringify(copy.target.ref) !== JSON.stringify(ref) ||
        JSON.stringify(copy.remote.binding) !== JSON.stringify(connection.binding) ||
        copy.remote.sha256 !== objectDigest['sha256']
      )
        return refused();
      if (copy.remote.key === binding.remoteKey) matched = true;
    }
    if (!matched) return refused();
  }
}
