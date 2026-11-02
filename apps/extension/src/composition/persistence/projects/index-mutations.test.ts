import { beforeEach, expect, it, vi } from 'vitest';
import { commitVideoProjectMutation, commitVideoProjectWorkspaceMutation } from './index-mutations';
import { createVideoProjectEntry } from './index.test-support';
import type { SyncCheckpointReceipt } from '../sync-capture/contracts';

const io = vi.hoisted(() => ({ save: vi.fn() }));
vi.mock('./index', () => ({ saveVideoProject: io.save }));
beforeEach(() => vi.clearAllMocks());

it.each([true, false])(
  'forwards only issued checkpoint metadata in workspace save ACK: %s',
  async (issued) => {
    const entry = createVideoProjectEntry({}, { workspaceRevision: 2 });
    const checkpointReceipt: SyncCheckpointReceipt = {
      rootKind: 'video-project',
      rootId: entry.id,
      revision: '11111111-1111-4111-8111-111111111111',
    };
    io.save.mockResolvedValue({ ...entry, ...(issued ? { checkpointReceipt } : {}) });
    const result = await commitVideoProjectWorkspaceMutation(entry.project, {
      expectedWorkspaceRevision: 1,
      expectedProject: entry.project,
    });
    expect(result).toEqual({
      project: entry.project,
      workspaceRevision: 2,
      ...(issued ? { checkpointReceipt } : {}),
    });
    if (!issued) expect(result).not.toHaveProperty('checkpointReceipt');
  }
);

it('keeps project-only mutation results free of ACK metadata', async () => {
  const entry = createVideoProjectEntry();
  io.save.mockResolvedValue({
    ...entry,
    checkpointReceipt: {
      rootKind: 'video-project',
      rootId: entry.id,
      revision: '11111111-1111-4111-8111-111111111111',
    },
  });
  expect(await commitVideoProjectMutation(entry.project)).toBe(entry.project);
});
