import { vi } from 'vitest';
import { createVideoReviewSession } from './session';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
import { applyLocalReviewChange } from './local-session';
import { parseReviewOperation } from '../../features/video/review/validation';
import { parseVideoWorkspace } from '../../composition/persistence/review-workspaces/parser';
import type { VideoWorkspaceSnapshot } from '../../composition/persistence/review-workspaces/contracts';
import type { ReviewTextVoicePreview } from './text-voice';
import { captureReviewTextTakeBasis } from './text-take';

/** Real session/replay with an admitted CAS adapter; tests can inject lost acknowledgements. */
export function createTextTakeBatchFixture(count = 2) {
  const advanced = createQuickEditAdvancedState();
  advanced.text = {
    version: 1,
    fragments: Array.from({ length: count }, (_, index) => ({
      id: `text-${index}`,
      text: `Narration ${index}`,
      originalText: `Narration ${index}`,
      start: index * 3,
      end: index * 3 + 1,
      timeDomain: 'result' as const,
      revision: 0,
      timingRevision: 0,
      alignment: 'manual' as const,
      showInVideo: true,
    })),
  };
  let stored: VideoWorkspaceSnapshot = {
    workspace: {
      aggregateId: 'review-batch',
      sourceAssetId: 'source-batch',
      formatVersion: 1,
      revision: 1,
      source: { duration: 40, width: 640, height: 360, mimeType: 'video/webm', size: 5 },
      advanced,
      history: [],
      cursor: 0,
      createdAt: 1,
      updatedAt: 1,
    },
    draft: null,
  };
  type Deps = NonNullable<Parameters<typeof createVideoReviewSession>[1]>;
  const commit = vi.fn<Deps['commitVideoWorkspace']>(async (request) => {
    if (
      request.expectedRevision !== stored.workspace.revision ||
      request.expectedSourceAssetId !== stored.workspace.sourceAssetId
    )
      throw new Error('conflict');
    const operation = parseReviewOperation(request.operation, stored.workspace.source.duration);
    if (!operation) throw new Error('Invalid fixture operation');
    const next = applyLocalReviewChange(stored, { kind: 'commit', operation, consumeDraft: false });
    stored = { ...next, workspace: { ...next.workspace, revision: stored.workspace.revision + 1 } };
    return structuredClone(stored);
  });
  const read = vi.fn<Deps['readVideoWorkspace']>(async () => structuredClone(stored));
  const save = vi.fn<Deps['saveVideoWorkspaceSnapshot']>(async (request) => {
    if (request.expectedRevision !== stored.workspace.revision) throw new Error('conflict');
    const workspace = parseVideoWorkspace(request.workspace);
    if (!workspace) throw new Error('Invalid fixture workspace');
    stored = { workspace: { ...workspace, revision: stored.workspace.revision + 1 }, draft: null };
    return structuredClone(stored);
  });
  const move = vi.fn<Deps['moveVideoWorkspaceHistory']>(async (request) => {
    if (request.expectedRevision !== stored.workspace.revision) throw new Error('conflict');
    stored = {
      ...stored,
      workspace: {
        ...stored.workspace,
        revision: stored.workspace.revision + 1,
        cursor: stored.workspace.cursor + (request.direction === 'undo' ? -1 : 1),
      },
    };
    return structuredClone(stored);
  });
  const session = createVideoReviewSession(structuredClone(stored), {
    commitVideoWorkspace: commit,
    readVideoWorkspace: read,
    saveVideoWorkspaceSnapshot: save,
    moveVideoWorkspaceHistory: move,
    saveVideoWorkspaceDraft: vi.fn(async () => structuredClone(stored)),
    saveVideoWorkspaceAdvanced: vi.fn(async () => structuredClone(stored)),
  });
  session.setAutosaveEnabled(false);
  const previews: ReviewTextVoicePreview[] = Array.from({ length: count }, (_, index) => {
    const basis = captureReviewTextTakeBasis(session, `text-${index}`);
    const fragment = basis.fragment;
    return {
      clipId: `take-${index}`,
      geometry: basis.geometry,
      duration: 1,
      resultStart: basis.resultStart,
      blob: new Blob(['audio'], { type: 'audio/mpeg' }),
      url: `blob:take-${index}`,
      expiresAt: Date.now() + 600_000,
      staged: { id: `staged-${index}`, mimeType: 'audio/mpeg', size: 5 },
      scope: {
        workspaceId: stored.workspace.aggregateId,
        workspaceRevision: stored.workspace.revision,
        target: { kind: 'text', fragmentId: fragment.id },
        textRevision: fragment.revision,
        timingRevision: fragment.timingRevision,
        start: fragment.start,
        end: fragment.end,
        timeDomain: fragment.timeDomain,
      },
      textSnapshot: {
        kind: 'ai',
        textId: fragment.id,
        text: fragment.text,
        revision: fragment.revision,
        timingRevision: fragment.timingRevision,
        start: fragment.start,
        end: fragment.end,
        timeDomain: fragment.timeDomain,
        profile: { modelId: 'model', voiceId: 'voice', responseFormat: 'mp3' },
      },
    };
  });
  return {
    session,
    previews,
    commit,
    read,
    save,
    move,
    stored: () => structuredClone(stored),
    replaceStored: (next: VideoWorkspaceSnapshot) => {
      stored = structuredClone(next);
    },
  };
}
