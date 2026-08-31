import { parseAssetRef, readAssetFile } from '../assets';
import { ASSET_REFS_STORE, WEB_SNAPSHOTS_STORE, initDB } from '../infrastructure/indexed-db/core';
import type { StoredWebSnapshotRecord, WebSnapshotRecord } from './contracts';
import { parseStoredWebSnapshotRecord } from './guards';
import { recoverWebSnapshotPublications } from './publication';

async function readStoredRecord(id: string): Promise<StoredWebSnapshotRecord | undefined> {
  const db = await initDB();
  return parseStoredWebSnapshotRecord(await db.get(WEB_SNAPSHOTS_STORE, id)) ?? undefined;
}

async function readRecordAsset(assetId: string, filename: string): Promise<File> {
  const db = await initDB();
  const ref = parseAssetRef(await db.get(ASSET_REFS_STORE, assetId));
  if (!ref) throw new Error(`Web snapshot asset ref is missing: ${assetId}.`);
  return readAssetFile(ref, filename);
}

export async function getStoredWebSnapshotRecord(
  id: string
): Promise<StoredWebSnapshotRecord | undefined> {
  await recoverWebSnapshotPublications();
  return readStoredRecord(id);
}

export async function getWebSnapshotPackageFile(id: string): Promise<File | undefined> {
  await recoverWebSnapshotPublications();
  const record = await readStoredRecord(id);
  return record
    ? readRecordAsset(record.packageAssetId, `${record.id}.sniptale-page-package.zip`)
    : undefined;
}

export async function getWebSnapshotScreenshotFile(id: string): Promise<File | undefined> {
  await recoverWebSnapshotPublications();
  const record = await readStoredRecord(id);
  return record ? readRecordAsset(record.screenshotAssetId, `${record.id}-screenshot`) : undefined;
}

export async function getWebSnapshotRecord(id: string): Promise<WebSnapshotRecord | undefined> {
  await recoverWebSnapshotPublications();
  const record = await readStoredRecord(id);
  if (!record) return undefined;
  const packageFile = await readRecordAsset(
    record.packageAssetId,
    `${record.id}.sniptale-page-package.zip`
  );
  const {
    packageAssetId: _packageAssetId,
    screenshotAssetId: _screenshotAssetId,
    screenshotMimeType: _screenshotMimeType,
    screenshotSize: _screenshotSize,
    ...metadata
  } = record;
  return { ...metadata, packageFile };
}
