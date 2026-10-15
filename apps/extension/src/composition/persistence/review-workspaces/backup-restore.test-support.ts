import { createQuickEditAdvancedState } from '../../../features/video/review/advanced/defaults';
import type { VideoWorkspace } from './contracts';

export const annotation = { id: 'a', text: 'Comment', anchor: { kind: 'point' as const, time: 1 } };
export const workspace: VideoWorkspace = {
  aggregateId: 'recording:one',
  formatVersion: 1,
  sourceAssetId: 'original-local',
  source: { duration: 2, width: 640, height: 360, size: 6, mimeType: 'video/webm' },
  revision: 4,
  cursor: 0,
  history: [{ id: 'op', at: 2, target: 'annotation', before: null, after: annotation }],
  advanced: createQuickEditAdvancedState(),
  createdAt: 1,
  updatedAt: 3,
};

export function snapshotDatabase(raw: unknown, rawDraft: unknown, rows: unknown[] = []) {
  return {
    transaction: () => ({
      objectStore: (store: string) => ({
        index: () => ({ getAll: async () => rows }),
        get: async () => (store === 'video_workspaces' ? raw : rawDraft),
      }),
      done: Promise.resolve(),
    }),
  };
}
