import type { Page } from '@playwright/test';
import { betaV1Fixture } from '../../../../apps/extension/src/composition/persistence/infrastructure/indexed-db/fixtures/beta-v1';

/** Native stored normalized inputs include matching opaque IDs across distinct recorded kinds. */
export async function seedActionAudioFacts(page: Page) {
  await page.evaluate(async (fixture) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(fixture.databaseName);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const tx = db.transaction('recording_telemetry', 'readwrite');
      const done = new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error);
      });
      tx.objectStore('recording_telemetry').put({
        recordingId: fixture.records.recordings[0].id,
        captureMode: 'TAB',
        createdAt: 1,
        updatedAt: 1,
        viewport: null,
        cursorTrack: null,
        actionEvents: [
          {
            id: 'same',
            kind: 'CLICK',
            time: 1,
            duration: 0,
            point: null,
            label: 'Point-free click',
            data: {},
            preset: 'NONE',
          },
          {
            id: 'key',
            kind: 'KEY',
            time: 5,
            duration: 0.55,
            point: null,
            label: 'Ctrl+Shift+A',
            data: { combo: 'Ctrl+Shift+A', key: 'a' },
            preset: 'NONE',
          },
        ],
        signals: [
          {
            id: 'same',
            kind: 'typing',
            startTime: 2,
            endTime: 6,
            point: null,
            data: { targetName: 'Typing target' },
          },
        ],
      });
      await done;
    } finally {
      db.close();
    }
  }, betaV1Fixture);
}
