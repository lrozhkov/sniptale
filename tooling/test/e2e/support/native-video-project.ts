import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import type { Page } from '@playwright/test';
import { parseHydratableVideoProject } from '../../../../apps/extension/src/features/video/project/validation/root';

export async function readNativeVideoProject(page: Page, expectedProjectId?: string) {
  const projectId = expectedProjectId ?? new URL(page.url()).searchParams.get('project');
  const values = await page.evaluate(async () => {
    const entries = await new Promise<unknown[]>((resolve, reject) => {
      const request = indexedDB.open('sniptale-db');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const read = db.transaction('video_projects').objectStore('video_projects').getAll();
        read.onerror = () => {
          db.close();
          reject(read.error);
        };
        read.onsuccess = () => {
          db.close();
          resolve(read.result);
        };
      };
    });
    for (const entry of entries) {
      if (typeof entry !== 'object' || !entry || !('project' in entry)) continue;
      const project = entry.project;
      if (
        typeof project !== 'object' ||
        !project ||
        !('effectSnapshots' in project) ||
        !Array.isArray(project.effectSnapshots)
      )
        continue;
      for (const snapshot of project.effectSnapshots) {
        if (
          typeof snapshot !== 'object' ||
          !snapshot ||
          !('assets' in snapshot) ||
          !Array.isArray(snapshot.assets)
        )
          continue;
        for (const asset of snapshot.assets) {
          if (
            typeof asset !== 'object' ||
            !asset ||
            !('blob' in asset) ||
            !(asset.blob instanceof Blob)
          )
            continue;
          const bytes = new Uint8Array(await asset.blob.arrayBuffer());
          let binary = '';
          for (const byte of bytes) binary += String.fromCharCode(byte);
          asset.blob = { observedNativeBlob: btoa(binary), mimeType: asset.blob.type };
        }
      }
    }
    return entries;
  });
  for (const value of values) {
    if (!isRecord(value) || !isRecord(value['project'])) continue;
    const snapshots = value['project']['effectSnapshots'];
    if (!Array.isArray(snapshots)) continue;
    for (const snapshot of snapshots) {
      if (!isRecord(snapshot) || !Array.isArray(snapshot['assets'])) continue;
      for (const asset of snapshot['assets']) {
        if (!isRecord(asset) || !isRecord(asset['blob'])) continue;
        const bytes = asset['blob']['observedNativeBlob'],
          mimeType = asset['blob']['mimeType'];
        if (typeof bytes === 'string' && typeof mimeType === 'string')
          asset['blob'] = new Blob([Buffer.from(bytes, 'base64')], { type: mimeType });
      }
    }
  }
  return values
    .flatMap((value) =>
      typeof value === 'object' && value !== null && 'project' in value
        ? [parseHydratableVideoProject(value.project)]
        : []
    )
    .filter((value) => value !== null)
    .find((value) => projectId === null || value.id === projectId);
}
