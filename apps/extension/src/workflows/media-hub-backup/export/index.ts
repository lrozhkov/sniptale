import JSZip from 'jszip';
import { initDB } from '../../../composition/persistence/infrastructure/indexed-db/core';
import { listMediaLibrary } from '../../../composition/persistence/media-library/index';
import { parseMediaLibraryEntry } from '../../../composition/persistence/media-library/read-guards';
import { appendBackupAssetDescriptor } from '../archive';
import {
  appendBackupTextEntry,
  assertBackupExportNotCancelled,
  type BackupExportBudget,
  createBackupExportBudget,
  generateBackupZipBlob,
} from './blob/budget';
import { shouldExportMediaEntry } from './filters';
import { createMediaHubBackupExportOptions } from './options';
import { buildVideoProjectDescriptors } from './projects/video-descriptors';
import { buildScenarioProjectDescriptors } from './projects/scenario-descriptors';
import { assertMediaHubBackupZipLimits } from './package-profile';
import { buildBackupManifest, type BackupProjectDescriptorSet } from './manifest';
import { buildEffectBundleDescriptors } from './effect-bundles';
import { MAX_BACKUP_JSON_BYTES } from '../manifest';
import type {
  MediaHubBackupAssetDescriptor,
  MediaHubBackupExportOptions,
} from '../contracts/types';

function encodePathSegment(value: string): string {
  return encodeURIComponent(value);
}

async function appendBackupMediaAssets(args: {
  budget: BackupExportBudget;
  db: Awaited<ReturnType<typeof initDB>>;
  items: Awaited<ReturnType<typeof listMediaLibrary>>;
  options: MediaHubBackupExportOptions;
  signal?: AbortSignal | undefined;
  zip: JSZip;
}): Promise<{ assets: MediaHubBackupAssetDescriptor[]; thumbnailCount: number }> {
  const assets: MediaHubBackupAssetDescriptor[] = [];
  let thumbnailCount = 0;

  for (const item of args.items) {
    assertBackupExportNotCancelled(args.signal);
    const entry = parseMediaLibraryEntry(await args.db.get('media_library', item.id));
    assertBackupExportNotCancelled(args.signal);
    if (!entry || !shouldExportMediaEntry(entry, args.options)) {
      continue;
    }

    thumbnailCount = await appendBackupAssetDescriptor({
      assets,
      budget: args.budget,
      db: args.db,
      encodePathSegment,
      entry,
      options: args.options,
      signal: args.signal,
      thumbnailCount,
      zip: args.zip,
    });
  }

  return { assets, thumbnailCount };
}

async function buildBackupProjectDescriptorSet(args: {
  budget: BackupExportBudget;
  db: Awaited<ReturnType<typeof initDB>>;
  options: MediaHubBackupExportOptions;
  signal?: AbortSignal | undefined;
  zip: JSZip;
}): Promise<BackupProjectDescriptorSet> {
  const videoProjects = await buildVideoProjectDescriptors(
    args.db,
    args.zip,
    args.budget,
    args.options,
    args.signal
  );
  const scenarioProjects = await buildScenarioProjectDescriptors(
    args.db,
    args.zip,
    args.budget,
    args.options,
    args.signal
  );
  const effectBundles = await buildEffectBundleDescriptors(args);

  return { effectBundles, scenarioProjects, videoProjects };
}

function appendBackupMetadataEntries(args: {
  assets: MediaHubBackupAssetDescriptor[];
  budget: BackupExportBudget;
  options: MediaHubBackupExportOptions;
  projects: BackupProjectDescriptorSet;
  signal?: AbortSignal | undefined;
  thumbnailCount: number;
  zip: JSZip;
}) {
  const manifest = buildBackupManifest(args);
  appendBackupTextEntry({
    budget: args.budget,
    label: 'manifest.json',
    maxBytes: MAX_BACKUP_JSON_BYTES,
    path: 'manifest.json',
    signal: args.signal,
    text: JSON.stringify(manifest, null, 2),
    zip: args.zip,
  });
  appendBackupTextEntry({
    budget: args.budget,
    label: 'metadata.json',
    maxBytes: MAX_BACKUP_JSON_BYTES,
    path: 'metadata.json',
    signal: args.signal,
    text: JSON.stringify(
      {
        assets: args.assets,
        effectBundles: args.projects.effectBundles,
        scenarioProjects: args.projects.scenarioProjects,
        videoProjects: args.projects.videoProjects,
      },
      null,
      2
    ),
    zip: args.zip,
  });
  return manifest;
}

async function collectBackupPayload(args: {
  budget: BackupExportBudget;
  db: Awaited<ReturnType<typeof initDB>>;
  options: MediaHubBackupExportOptions;
  signal?: AbortSignal | undefined;
  zip: JSZip;
}) {
  const items = await listMediaLibrary();
  assertBackupExportNotCancelled(args.signal);
  const { assets, thumbnailCount } = await appendBackupMediaAssets({
    budget: args.budget,
    db: args.db,
    items,
    options: args.options,
    signal: args.signal,
    zip: args.zip,
  });
  const projects = await buildBackupProjectDescriptorSet(args);
  return {
    assets,
    thumbnailCount,
    projects,
  };
}

export async function exportMediaHubBackup(
  rawOptions: Partial<MediaHubBackupExportOptions> = {},
  runtimeOptions: { signal?: AbortSignal | undefined } = {}
): Promise<Blob> {
  assertBackupExportNotCancelled(runtimeOptions.signal);
  const options = createMediaHubBackupExportOptions(rawOptions);
  const db = await initDB();
  assertBackupExportNotCancelled(runtimeOptions.signal);
  const zip = new JSZip();
  const budget = createBackupExportBudget();
  const payload = await collectBackupPayload({
    budget,
    db,
    options,
    signal: runtimeOptions.signal,
    zip,
  });
  const manifest = appendBackupMetadataEntries({
    ...payload,
    budget,
    options,
    signal: runtimeOptions.signal,
    zip,
  });

  assertMediaHubBackupZipLimits(zip, manifest);
  return generateBackupZipBlob({
    budget,
    signal: runtimeOptions.signal,
    zip,
  });
}
