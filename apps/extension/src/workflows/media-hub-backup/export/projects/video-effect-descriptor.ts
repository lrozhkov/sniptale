import type JSZip from 'jszip';

import type { parseVideoProjectEntry } from '../../../../composition/persistence/projects/read-guards';
import { createBackupBlobDescriptor } from '../blob/descriptor';
import type { BackupExportBudget } from '../blob/budget';
import type { EffectProjectBackupDescriptor } from '../../contracts/types';
import { safeBackupPathSegment } from '../../metadata/path-segments';

type VideoProjectEntry = NonNullable<Awaited<ReturnType<typeof parseVideoProjectEntry>>>;

export function createBackupVideoProjectEntry(entry: VideoProjectEntry) {
  const {
    effectInstances: _effectInstances,
    effectSnapshots: _effectSnapshots,
    ...project
  } = entry.project;
  return { ...entry, project };
}

export function buildEffectProjectDescriptor(
  zip: JSZip,
  budget: BackupExportBudget,
  entry: VideoProjectEntry,
  signal: AbortSignal | undefined
): EffectProjectBackupDescriptor | null {
  const instances = entry.project.effectInstances ?? [];
  const snapshots = entry.project.effectSnapshots ?? [];
  if (instances.length === 0 && snapshots.length === 0) return null;
  const projectSegment = safeBackupPathSegment(entry.id, 'video project id');
  return {
    instances,
    snapshots: snapshots.map((snapshot, snapshotIndex) => {
      const { assets, ...snapshotEntry } = snapshot;
      return {
        ...snapshotEntry,
        assets: assets.map((asset, assetIndex) =>
          createBackupBlobDescriptor(
            zip,
            budget,
            `video-projects/${projectSegment}/effects/${snapshotIndex}/${assetIndex}`,
            asset,
            signal
          )
        ),
      };
    }),
  };
}
