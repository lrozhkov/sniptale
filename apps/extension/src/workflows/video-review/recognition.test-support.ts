import { vi } from 'vitest';
import type { VideoWorkspaceSnapshot } from '../../composition/persistence/review-workspaces/contracts';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
import {
  parseVideoWorkspace,
  parseVideoWorkspaceDraft,
} from '../../composition/persistence/review-workspaces/parser';
import { parseReviewOperation } from '../../features/video/review/validation';
import { applyLocalReviewChange } from './local-session';
import { createVideoReviewSession } from './session';

export function createRecognitionFixture(duration = 125) {
  let stored: VideoWorkspaceSnapshot = {
    workspace: {
      aggregateId: 'recording:r',
      sourceAssetId: 'source',
      formatVersion: 1,
      source: { duration, width: 640, height: 360, mimeType: 'video/webm', size: 5 },
      revision: 1,
      cursor: 0,
      history: [],
      advanced: createQuickEditAdvancedState(),
      createdAt: 1,
      updatedAt: 1,
    },
    draft: null,
  };
  const deps = {
    saveVideoWorkspaceDraft: vi.fn(async () => structuredClone(stored)),
    saveVideoWorkspaceAdvanced: vi.fn(
      async (
        request: Parameters<
          typeof import('../../composition/persistence/review-workspaces/store').saveVideoWorkspaceAdvanced
        >[0]
      ) => {
        const workspace = parseVideoWorkspace({
          ...stored.workspace,
          advanced: request.advanced,
          revision: stored.workspace.revision + 1,
        });
        if (!workspace) throw new Error('invalid fixture advanced Save');
        stored = { ...stored, workspace };
        return structuredClone(stored);
      }
    ),
    saveVideoWorkspaceSnapshot: vi.fn(
      async (
        request: Parameters<
          typeof import('../../composition/persistence/review-workspaces/store').saveVideoWorkspaceSnapshot
        >[0]
      ) => {
        const workspace = parseVideoWorkspace(request.workspace);
        const draft =
          request.draft === null
            ? null
            : parseVideoWorkspaceDraft(request.draft, stored.workspace.source.duration);
        if (!workspace || (request.draft !== null && !draft))
          throw new Error('invalid fixture Save');
        stored = {
          workspace: {
            ...workspace,
            revision: stored.workspace.revision + 1,
          },
          draft,
        };
        return structuredClone(stored);
      }
    ),
    commitVideoWorkspace: vi.fn(
      async (
        request: Parameters<
          typeof import('../../composition/persistence/review-workspaces/store').commitVideoWorkspace
        >[0]
      ) => {
        const operation = parseReviewOperation(request.operation, stored.workspace.source.duration);
        if (!operation) throw new Error('invalid fixture operation');
        const next = applyLocalReviewChange(stored, {
          kind: 'commit',
          operation,
          consumeDraft: false,
        });
        stored = {
          ...next,
          workspace: { ...next.workspace, revision: stored.workspace.revision + 1 },
        };
        return structuredClone(stored);
      }
    ),
    readVideoWorkspace: vi.fn(async (): Promise<VideoWorkspaceSnapshot | null> =>
      structuredClone(stored)
    ),
    moveVideoWorkspaceHistory: vi.fn(async () => structuredClone(stored)),
  };
  const session = createVideoReviewSession(stored, deps);
  session.setAutosaveEnabled(false);
  return { session, deps };
}
