import { betaV1Fixture } from '../infrastructure/indexed-db/fixtures/beta-v1';

/** Shared transactional fixture retains commit/abort and quota behavior. */
export function createReviewWorkspaceStoreFixture(failure: () => boolean) {
  const id = 'recording:beta-v1-recording';
  const rows: Map<string, Map<string, unknown>> = new Map([
    ['media_library', new Map([[id, betaV1Fixture.records.media_library[0]]])],
    ['recordings', new Map([['beta-v1-recording', betaV1Fixture.records.recordings[0]]])],
    ['project_assets', new Map()],
    ['project_exports', new Map()],
    ['video_workspaces', new Map()],
    ['video_workspace_drafts', new Map()],
  ]);
  const database = {
    transaction: (_stores: string[], mode: string) => {
      const pending = structuredClone(rows);
      let aborted = false;
      return {
        abort() {
          aborted = true;
        },
        objectStore(name: string) {
          const store = pending.get(name)!;
          return {
            get: async (key: string) => structuredClone(store.get(key)),
            put: async (value: { aggregateId: string }) => {
              if (failure()) throw new DOMException('No space', 'QuotaExceededError');
              store.set(value.aggregateId, structuredClone(value));
            },
            delete: async (key: string) => {
              store.delete(key);
            },
          };
        },
        get done() {
          if (aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
          if (mode === 'readwrite') {
            rows.clear();
            for (const [name, values] of pending) rows.set(name, values);
          }
          return Promise.resolve();
        },
      };
    },
  };
  return { rows, database };
}
