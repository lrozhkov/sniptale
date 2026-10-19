import type { Page } from '@playwright/test';
import { parseHydratableVideoProject } from '../../../../apps/extension/src/features/video/project/validation/root';

export async function readNativeVideoProject(page: Page) {
  const values = await page.evaluate(
    () =>
      new Promise<unknown[]>((resolve, reject) => {
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
      })
  );
  return values
    .flatMap((value) =>
      typeof value === 'object' && value !== null && 'project' in value
        ? [parseHydratableVideoProject(value.project)]
        : []
    )
    .find((value) => value !== null);
}
