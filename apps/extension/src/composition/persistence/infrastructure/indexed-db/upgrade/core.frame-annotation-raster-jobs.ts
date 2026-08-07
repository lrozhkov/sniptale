import { FRAME_ANNOTATION_RASTER_JOBS_STORE } from '../core.stores';
import type { UpgradeDatabase } from './types';

export function applyFrameAnnotationRasterJobsStoreUpgrade(
  db: UpgradeDatabase,
  oldVersion: number
): void {
  if (oldVersion >= 23 || db.objectStoreNames.contains(FRAME_ANNOTATION_RASTER_JOBS_STORE)) return;
  const store = db.createObjectStore(FRAME_ANNOTATION_RASTER_JOBS_STORE, { keyPath: 'jobId' });
  store.createIndex('createdAt', 'createdAt');
}
