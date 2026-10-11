import type { Page } from '@playwright/test';
import { DB_NAME } from '../../../../apps/extension/src/composition/persistence/infrastructure/indexed-db/core.stores';
import { materializeWorkspaceStorage } from '../../../../apps/extension/src/composition/persistence/review-workspaces/storage-format';
import { parseVideoWorkspace } from '../../../../apps/extension/src/composition/persistence/review-workspaces/parser';
import type { VideoWorkspace } from '../../../../apps/extension/src/composition/persistence/review-workspaces/contracts';

/** Observe retained logical evidence through one native head/history readonly snapshot. */
export async function readNativeReviewWorkspaceValue(
  page: Page,
  aggregateId: string
): Promise<unknown> {
  const stored = await page.evaluate(
    ({ name, id }) =>
      new Promise<{ head: unknown; rows: unknown[] }>((resolve, reject) => {
        const request = indexedDB.open(name);
        request.onerror = () => reject(request.error);
        request.onupgradeneeded = () => {
          request.transaction?.abort();
          reject(new Error('Native workspace database is absent'));
        };
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction(['video_workspaces', 'video_workspace_history'], 'readonly');
          let head: unknown;
          let rows: unknown[] = [];
          const root = tx.objectStore('video_workspaces').get(id);
          root.onsuccess = () => {
            head = root.result;
          };
          const history = tx.objectStore('video_workspace_history').index('aggregateId').getAll(id);
          history.onsuccess = () => {
            const value: unknown = history.result;
            if (!Array.isArray(value)) {
              tx.abort();
              return;
            }
            rows = value;
          };
          tx.oncomplete = () => {
            db.close();
            resolve({ head, rows });
          };
          tx.onabort = () => {
            db.close();
            reject(tx.error ?? new Error('Native workspace read aborted'));
          };
        };
      }),
    { name: DB_NAME, id: aggregateId }
  );
  return materializeWorkspaceStorage(stored.head, stored.rows);
}

/** Admit the complete observed workspace with the product parser. */
export async function readNativeReviewWorkspace(
  page: Page,
  aggregateId: string
): Promise<VideoWorkspace | null> {
  const value = await readNativeReviewWorkspaceValue(page, aggregateId);
  if (value === undefined) return null;
  const workspace = parseVideoWorkspace(value);
  if (!workspace || workspace.aggregateId !== aggregateId)
    throw new Error('Native workspace is invalid');
  return workspace;
}

/** Intentional legacy/corrupt fixture replacement clears only its selected physical history. */
export async function replaceNativeReviewWorkspace(
  page: Page,
  aggregateId: string,
  value: unknown
): Promise<void> {
  await page.evaluate(
    ({ name, id, workspace }) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open(name);
        request.onerror = () => reject(request.error);
        request.onupgradeneeded = () => {
          request.transaction?.abort();
          reject(new Error('Native fixture database is absent'));
        };
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction(['video_workspaces', 'video_workspace_history'], 'readwrite');
          const history = tx.objectStore('video_workspace_history');
          const keys = history.index('aggregateId').getAllKeys(id);
          keys.onsuccess = () => {
            for (const key of keys.result) history.delete(key);
            tx.objectStore('video_workspaces').put(workspace);
          };
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onabort = () => {
            db.close();
            reject(tx.error ?? new Error('Native fixture replacement aborted'));
          };
        };
      }),
    { name: DB_NAME, id: aggregateId, workspace: value }
  );
}
