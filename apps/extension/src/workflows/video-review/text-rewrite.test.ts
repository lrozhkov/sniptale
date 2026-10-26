import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  captureReviewTextRewrite,
  generateReviewTextRewrite,
  applyReviewTextRewritePreview,
  reviewTextRewriteWasApplied,
} from './text-rewrite';
import { createVideoReviewSession } from './session';
import type { VideoWorkspaceSnapshot } from '../../composition/persistence/review-workspaces/contracts';
import {
  parseVideoWorkspace,
  parseVideoWorkspaceDraft,
} from '../../composition/persistence/review-workspaces/parser';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
import {
  applyReviewOperation,
  replayReviewHistory,
  reviewAdvancedContentBaseline,
} from '../../features/video/review/document';
import { parseReviewOperation } from '../../features/video/review/validation';
import {
  editReviewTextFragment,
  reviewVoiceTextStatus,
} from '../../features/video/review/text-document';
import { buildReviewTimeMap } from '../../features/video/review/timeline';

const mocks = vi.hoisted(() => ({ job: vi.fn(), token: vi.fn() }));
vi.mock('./text-rewrite-client', () => ({ runReviewTextJob: mocks.job }));
vi.mock('../ai-session/llm-session', () => ({ requestLlmSessionToken: mocks.token }));
const model = {
  modelId: 'model',
  approvedProviderId: 'provider',
  approvedDestination: `sha256:${'a'.repeat(64)}`,
  approvedModelCode: 'code',
};
const options = {
  prompt: 'Shorten',
  mode: 'phrases' as const,
  wholeDocument: true,
  changeIntervals: false,
  resegment: false,
};
const signal = () => new AbortController().signal;
function fixture(timeDomain: 'source' | 'result' = 'source') {
  const advanced = createQuickEditAdvancedState();
  const fragment = {
    id: 'text',
    text: 'Original text',
    originalText: 'Original text',
    start: 1,
    end: 2,
    timeDomain,
    revision: 0,
    timingRevision: 0,
    alignment: 'word' as const,
    showInVideo: true,
    words: [{ text: 'Original text', start: 1, end: 2 }],
    origin: {
      kind: 'original' as const,
      start: 1,
      end: 2,
      words: [{ text: 'Original text', start: 1, end: 2 }],
    },
  };
  advanced.text = { version: 1, fragments: [fragment] };
  advanced.audio.voiceover = [
    {
      id: 'voice',
      assetId: 'project-asset:voice',
      timelineStart: 1,
      sourceOffset: 0,
      duration: 1,
      volume: 1,
      muted: false,
      fadeIn: 0,
      fadeOut: 0,
      textSnapshot: {
        kind: 'microphone',
        textId: fragment.id,
        revision: 0,
        timingRevision: 0,
        text: fragment.text,
        start: fragment.start,
        end: fragment.end,
        timeDomain: fragment.timeDomain,
      },
    },
  ];
  advanced.audio.original.mutes = [{ id: 'mute', kind: 'take', clipId: 'voice' }];
  advanced.audio.voiceoverSegments = buildReviewTimeMap(10, []);
  let saved: VideoWorkspaceSnapshot | null = {
    workspace: {
      aggregateId: 'video',
      sourceAssetId: 'source',
      formatVersion: 1,
      revision: 1,
      source: { duration: 10, width: 640, height: 360, size: 5, mimeType: 'video/webm' },
      advanced,
      history: [],
      cursor: 0,
      createdAt: 1,
      updatedAt: 1,
    },
    draft: null,
  };
  const canonical = parseVideoWorkspace(saved.workspace);
  if (!canonical) throw new Error('invalid fixture');
  saved.workspace = canonical;
  type Dependencies = NonNullable<Parameters<typeof createVideoReviewSession>[1]>;
  const save = vi.fn<Dependencies['saveVideoWorkspaceSnapshot']>(async (args) => {
    const workspace = parseVideoWorkspace(args.workspace);
    if (!workspace || !saved || args.expectedRevision !== saved.workspace.revision)
      throw new Error('conflict');
    saved = {
      workspace: { ...workspace, revision: saved.workspace.revision + 1 },
      draft:
        args.draft == null ? null : parseVideoWorkspaceDraft(args.draft, workspace.source.duration),
    };
    return structuredClone(saved);
  });
  const commit = vi.fn<Dependencies['commitVideoWorkspace']>(async (args) => {
    if (!saved) throw new Error('missing');
    const operation = parseReviewOperation(args.operation, saved.workspace.source.duration);
    if (!operation || args.expectedRevision !== saved.workspace.revision)
      throw new Error('conflict');
    const document = replayReviewHistory(
      saved.workspace.history,
      saved.workspace.cursor,
      saved.workspace.source,
      reviewAdvancedContentBaseline(saved.workspace.advanced)
    );
    applyReviewOperation(document, operation, saved.workspace.source);
    saved = {
      ...saved,
      workspace: {
        ...saved.workspace,
        revision: saved.workspace.revision + 1,
        history: [...saved.workspace.history.slice(0, saved.workspace.cursor), operation],
        cursor: saved.workspace.cursor + 1,
      },
    };
    return structuredClone(saved);
  });
  const read = vi.fn<Dependencies['readVideoWorkspace']>(async () => structuredClone(saved));
  const session = createVideoReviewSession(structuredClone(saved), {
    saveVideoWorkspaceSnapshot: save,
    commitVideoWorkspace: commit,
    readVideoWorkspace: read,
    saveVideoWorkspaceDraft: vi.fn(async () => {
      if (!saved) throw new Error('missing');
      return saved;
    }),
    saveVideoWorkspaceAdvanced: vi.fn(async () => {
      if (!saved) throw new Error('missing');
      return saved;
    }),
    moveVideoWorkspaceHistory: vi.fn(async ({ direction }) => {
      if (!saved) throw new Error('missing');
      saved = {
        ...saved,
        workspace: {
          ...saved.workspace,
          revision: saved.workspace.revision + 1,
          cursor: saved.workspace.cursor + (direction === 'undo' ? -1 : 1),
        },
      };
      return structuredClone(saved);
    }),
  });
  const change = async (patch: { text?: string; gain?: number; cut?: boolean }) => {
    const current = session.getSnapshot().document.advancedContent;
    if (patch.cut) {
      await session.commit({
        id: crypto.randomUUID(),
        at: Date.now(),
        target: 'edit',
        before: null,
        after: { id: 'cut', kind: 'cut', start: 4, end: 5, requestedStart: 4, requestedEnd: 5 },
      });
      return;
    }
    const next =
      patch.text === undefined
        ? null
        : editReviewTextFragment(current.text!, 'text', { text: patch.text });
    if (next && !next.ok) throw new Error('invalid');
    await session.commit({
      id: crypto.randomUUID(),
      at: Date.now(),
      target: 'advancedContent',
      before: current,
      after: {
        ...current,
        ...(next?.ok ? { text: next.document } : {}),
        ...(patch.gain !== undefined
          ? {
              audio: {
                ...current.audio,
                original: { ...current.audio.original, volume: patch.gain },
              },
            }
          : {}),
      },
    });
  };
  return {
    session,
    save,
    commit,
    read,
    change,
    erase: () => {
      saved = null;
    },
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.token.mockResolvedValue('token');
  mocks.job.mockResolvedValue({ version: 1, fragments: [{ fromIds: ['text'], text: 'Edited' }] });
});

describe('durable AI text workflow', () => {
  it.each([false, true])(
    'saves the whole buffer before dispatch with autosave=%s and preserves sound and mute on one Apply/Undo',
    async (autosave) => {
      const { session, change, save, commit } = fixture();
      session.setAutosaveEnabled(autosave);
      await change({ text: 'Buffered text', gain: 0.6, cut: false });
      await change({ cut: true });
      const before = structuredClone(session.getSnapshot().document);
      const captured = captureReviewTextRewrite(session, ['text'], options);
      mocks.job.mockImplementationOnce(async (start) => {
        if (!autosave) expect(save).toHaveBeenCalled();
        expect(session.getSnapshot().dirty).toBe(false);
        expect(start.context.fragments[0].text).toBe('Buffered text');
        expect(start.scope.workspaceRevision).toBe(
          session.getSnapshot().snapshot.workspace.revision
        );
        expect(JSON.stringify(start.context)).not.toContain('source');
        return { version: 1, fragments: [{ fromIds: ['text'], text: 'Edited' }] };
      });
      const preview = await generateReviewTextRewrite(session, captured, model, signal());
      expect(session.getSnapshot().document).toEqual(before);
      const count = commit.mock.calls.length;
      await change({ gain: 0.4 });
      const audio = structuredClone(session.getSnapshot().document.advancedContent.audio);
      await applyReviewTextRewritePreview(session, preview, signal(), 'replace');
      expect(commit.mock.calls.length).toBe(count + (autosave ? 1 : 0) + 1);
      expect(session.getSnapshot().autosaveEnabled).toBe(autosave);
      const current = session.getSnapshot().document.advancedContent;
      expect(current.audio).toEqual(audio);
      expect(current.text?.fragments[0]).toMatchObject({
        id: 'text',
        text: 'Edited',
        start: 1,
        end: 2,
        timeDomain: 'source',
        origin: before.advancedContent.text!.fragments[0]!.origin,
      });
      expect(
        reviewVoiceTextStatus(current.text?.fragments[0], current.audio.voiceover[0]!.textSnapshot!)
      ).toBe('text-changed');
      await session.history('undo');
      expect(session.getSnapshot().document.advancedContent.text).toEqual(
        before.advancedContent.text
      );
      expect(session.getSnapshot().document.advancedContent.audio).toEqual(audio);
    }
  );
  it('refuses changes during Save or before Apply and never posts a stale disclosed context', async () => {
    const { session, change } = fixture();
    session.setAutosaveEnabled(false);
    const captured = captureReviewTextRewrite(session, ['text'], options);
    await change({ text: 'Newer text' });
    await expect(generateReviewTextRewrite(session, captured, model, signal())).rejects.toThrow(
      'stale'
    );
    expect(mocks.job).not.toHaveBeenCalled();
    expect(mocks.token).not.toHaveBeenCalled();
    const fresh = captureReviewTextRewrite(session, ['text'], options);
    const preview = await generateReviewTextRewrite(session, fresh, model, signal());
    await change({ cut: true });
    await expect(
      applyReviewTextRewritePreview(session, preview, signal(), 'replace')
    ).rejects.toThrow('stale');
  });
  it('creates a hidden variant without touching existing text/audio, and a no-op creates no new history', async () => {
    const { session, commit } = fixture();
    const before = structuredClone(session.getSnapshot().document.advancedContent);
    const captured = captureReviewTextRewrite(session, ['text'], options);
    const preview = await generateReviewTextRewrite(session, captured, model, signal());
    preview.proposal = { version: 1, fragments: [{ fromIds: ['text'], text: 'Original text' }] };
    await applyReviewTextRewritePreview(session, preview, signal(), 'replace');
    expect(commit).not.toHaveBeenCalled();
    preview.proposal.fragments[0]!.text = 'Alternative';
    await applyReviewTextRewritePreview(session, preview, signal(), 'variant');
    const current = session.getSnapshot().document.advancedContent;
    expect(current.text?.fragments[0]).toEqual(before.text!.fragments[0]);
    expect(current.text?.fragments[1]).toMatchObject({
      showInVideo: false,
      text: 'Alternative',
      derivedFrom: ['text'],
    });
    expect(current.audio).toEqual(before.audio);
  });
  it('keeps history, alignment and linked takes on an unchanged structural replacement', async () => {
    const { session, commit } = fixture('result');
    const before = structuredClone(session.getSnapshot().document);
    const history = structuredClone(session.getSnapshot().snapshot.workspace.history);
    const captured = captureReviewTextRewrite(session, ['text'], {
      ...options,
      mode: 'script',
      changeIntervals: true,
      resegment: true,
    });
    const preview = await generateReviewTextRewrite(session, captured, model, signal());
    preview.proposal = {
      version: 1,
      fragments: [{ fromIds: ['text'], text: 'Original text', start: 1, end: 2 }],
    };
    await applyReviewTextRewritePreview(session, preview, signal(), 'replace');
    expect(commit).not.toHaveBeenCalled();
    const current = session.getSnapshot().document;
    expect(session.getSnapshot().snapshot.workspace.history).toEqual(history);
    expect(current.advancedContent).toEqual(before.advancedContent);
    expect(
      reviewVoiceTextStatus(
        current.advancedContent.text?.fragments[0],
        current.advancedContent.audio.voiceover[0]!.textSnapshot!
      )
    ).toBe('current');
  });
  it('acknowledges accepted receipts no Save even after Undo and newer buffered edits, and re...', async () => {
    const { session, change, save, erase } = fixture();
    session.setAutosaveEnabled(false);
    const preview = await generateReviewTextRewrite(
      session,
      captureReviewTextRewrite(session, ['text'], options),
      model,
      signal()
    );
    await applyReviewTextRewritePreview(session, preview, signal(), 'replace');
    await session.history('undo');
    await change({ text: 'New buffer', gain: 0.3 });
    const current = structuredClone(session.getSnapshot());
    const saves = save.mock.calls.length;
    await expect(reviewTextRewriteWasApplied(session, preview, signal())).resolves.toBe(true);
    await applyReviewTextRewritePreview(session, preview, signal(), 'replace');
    expect(save.mock.calls.length).toBe(saves);
    expect(session.getSnapshot()).toEqual(current);
    erase();
    await expect(reviewTextRewriteWasApplied(session, preview, signal())).rejects.toThrow(
      'unavailable'
    );
    expect(save.mock.calls.length).toBe(saves);
  });
  it('retains invalid for a non-budget context error without changing review state or dispatching', () => {
    const { session, save } = fixture();
    const before = structuredClone(session.getSnapshot());
    const saves = save.mock.calls.length;
    expect(() =>
      captureReviewTextRewrite(session, ['text'], { ...options, prompt: '   ' })
    ).toThrow(new Error('invalid'));
    expect(session.getSnapshot()).toEqual(before);
    expect(save.mock.calls.length).toBe(saves);
    expect(mocks.token).not.toHaveBeenCalled();
    expect(mocks.job).not.toHaveBeenCalled();
  });

  it('refuses an excessive projected output before saving or dispatching the review request', async () => {
    const { session, change, save } = fixture();
    await change({ text: 'x'.repeat(1_200) });
    const before = structuredClone(session.getSnapshot());
    const saves = save.mock.calls.length;
    expect(() => captureReviewTextRewrite(session, ['text'], options)).toThrow(
      new Error('too-large')
    );
    expect(session.getSnapshot()).toEqual(before);
    expect(save.mock.calls.length).toBe(saves);
    expect(mocks.token).not.toHaveBeenCalled();
    expect(mocks.job).not.toHaveBeenCalled();
  });

  it('requires explicit full-document scope for restructuring and refuses a large context before Save or API', () => {
    const { session } = fixture();
    expect(() =>
      captureReviewTextRewrite(session, ['text'], {
        ...options,
        wholeDocument: false,
        mode: 'script',
        changeIntervals: true,
        resegment: true,
      })
    ).toThrow('invalid');
    expect(() =>
      captureReviewTextRewrite(session, ['text'], { ...options, prompt: 'x'.repeat(4_001) })
    ).toThrow('too-large');
    expect(mocks.token).not.toHaveBeenCalled();
    expect(mocks.job).not.toHaveBeenCalled();
  });
  it('retries confirmed absence with the same operation and variant IDs while preserving newer gain', async () => {
    const { session, commit, change } = fixture();
    session.setAutosaveEnabled(false);
    const preview = await generateReviewTextRewrite(
      session,
      captureReviewTextRewrite(session, ['text'], options),
      model,
      signal()
    );
    commit.mockRejectedValueOnce(new Error('write failed'));
    await expect(
      applyReviewTextRewritePreview(session, preview, signal(), 'variant')
    ).rejects.toThrow();
    const operationId = preview.receipt!.id;
    const generatedIds = [...preview.generatedIds!];
    await change({ gain: 0.45 });
    const audio = structuredClone(session.getSnapshot().document.advancedContent.audio);
    await applyReviewTextRewritePreview(session, preview, signal(), 'variant');
    expect(preview.receipt!.id).toBe(operationId);
    expect(preview.generatedIds).toEqual(generatedIds);
    expect(session.getSnapshot().document.advancedContent.audio).toEqual(audio);
    expect(session.getSnapshot().document.advancedContent.text?.fragments).toHaveLength(2);
    expect(session.getSnapshot().document.advancedContent.text?.fragments[1]?.id).toBe(
      generatedIds.at(-1)
    );
    expect(mocks.job).toHaveBeenCalledTimes(1);
  });
});
