import { beforeEach, expect, it, vi } from 'vitest';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
import type { VideoWorkspaceSnapshot } from '../../composition/persistence/review-workspaces/contracts';
import { reviewSpeechTextSignature } from '../../features/video/review/speech-transcript';
import { createVideoReviewSession } from './session';
import {
  getReviewSpeechTarget,
  reviewSpeechGeometry,
  type ReviewSpeechPreview,
} from './speech-publication';
import { planReviewSpeechQueue, runReviewSpeechQueue } from './speech-queue';

const mocks = vi.hoisted(() => ({ generate: vi.fn(), cleanup: vi.fn() }));
vi.mock('./speech-publication', async (original) => ({
  ...(await original<typeof import('./speech-publication')>()),
  generateReviewSpeech: mocks.generate,
  cleanupReviewSpeechPreview: mocks.cleanup,
}));
const profile = { modelId: 'model', voiceId: 'voice', responseFormat: 'wav' as const };
const selections = ['a', 'b'].map((clipId) => ({
  target: { kind: 'voiceover' as const, clipId },
  phraseId: 'same-phrase',
}));

function fixture() {
  const advanced = createQuickEditAdvancedState();
  advanced.audio.voiceover = ['a', 'b'].map((id, index) => ({
    id,
    assetId: `project-asset:${id}`,
    timelineStart: index * 3,
    sourceOffset: 0,
    duration: 2,
    volume: 1,
    muted: false,
    fadeIn: 0,
    fadeOut: 0,
    transcript: {
      version: 1,
      profile,
      replacements: [],
      phrases: [
        {
          id: 'same-phrase',
          text: `Text ${id}`,
          originalText: `Text ${id}`,
          start: 0,
          end: 2,
          revision: 0,
          alignment: 'range',
        },
      ],
    },
  }));
  const snapshot: VideoWorkspaceSnapshot = {
    workspace: {
      aggregateId: 'recording:queue',
      sourceAssetId: 'source',
      formatVersion: 1,
      source: { duration: 12, width: 640, height: 360, mimeType: 'video/webm', size: 5 },
      revision: 1,
      cursor: 0,
      history: [],
      advanced,
      createdAt: 1,
      updatedAt: 1,
    },
    draft: null,
  };
  const session = createVideoReviewSession(snapshot);
  const plan = planReviewSpeechQueue(session, selections, profile);
  const previews = selections.map((selection): ReviewSpeechPreview => {
    const phrase = getReviewSpeechTarget(session, selection.target).transcript!.phrases[0]!;
    return {
      blob: new Blob(['audio']),
      url: `blob:${selection.target.clipId}`,
      scope: {
        workspaceId: 'recording:queue',
        workspaceRevision: 1,
        target: selection.target,
        assetId: `project-asset:${selection.target.clipId}`,
        nativeStart: 0,
        nativeEnd: 2,
      },
      staged: { id: selection.target.clipId, mimeType: 'audio/wav', size: 5 },
      geometry: reviewSpeechGeometry(session, selection.target),
      createdAt: 1,
      expiresAt: 100000,
      replacement: {
        ...phrase,
        id: selection.target.clipId,
        phraseId: phrase.id,
        assetId: `project-asset:generated-${selection.target.clipId}`,
        duration: 1,
        profile,
        textSignature: reviewSpeechTextSignature(phrase.text, profile),
      },
    };
  });
  return { session, plan, previews };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.cleanup.mockResolvedValue(undefined);
});

it('freezes a deduplicated target/phrase set and synthesis profile before submission', () => {
  const { session } = fixture();
  const chosen = [...selections, selections[0]!];
  const settings = { ...profile };
  const plan = planReviewSpeechQueue(session, chosen, settings);
  chosen.pop();
  chosen.pop();
  settings.voiceId = 'changed';
  expect(plan.items).toHaveLength(2);
  expect(plan.profile.voiceId).toBe('voice');
  expect(plan.items.map((item) => item.target)).toEqual(selections.map((entry) => entry.target));
  expect(() => planReviewSpeechQueue(session, [], profile)).toThrow('invalid');
});

it('retains first completed result when a later request fails and never retries automatically', async () => {
  const { session, plan, previews } = fixture();
  mocks.generate
    .mockResolvedValueOnce(previews[0])
    .mockRejectedValueOnce(new Error('provider-failed'));
  const ready = vi.fn();
  const progress = vi.fn();
  await expect(
    runReviewSpeechQueue(session, plan, new AbortController().signal, { ready, progress })
  ).rejects.toThrow('provider-failed');
  expect(ready).toHaveBeenCalledExactlyOnceWith(previews[0]);
  expect(mocks.generate).toHaveBeenCalledTimes(2);
  expect(progress.mock.calls.at(-1)?.[0]).toMatchObject({ completed: 1, total: 2 });
  expect(mocks.cleanup).not.toHaveBeenCalled();
});

it('cancels remaining requests without removing already handed-off previews', async () => {
  const { session, plan, previews } = fixture();
  const controller = new AbortController();
  mocks.generate.mockResolvedValue(previews[0]);
  const ready = vi.fn(() => controller.abort());
  await expect(
    runReviewSpeechQueue(session, plan, controller.signal, { ready, progress: vi.fn() })
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect(mocks.generate).toHaveBeenCalledTimes(1);
  expect(ready).toHaveBeenCalledExactlyOnceWith(previews[0]);
  expect(mocks.cleanup).not.toHaveBeenCalled();
});

it('rejects changed queued text before charging for the changed target', async () => {
  const { session, plan, previews } = fixture();
  mocks.generate.mockResolvedValue(previews[0]);
  const ready = vi.fn(() => {
    const changed = structuredClone(session.getSnapshot());
    changed.document.advancedContent.audio.voiceover[1]!.transcript!.phrases[0]!.text =
      'Changed after launch';
    vi.spyOn(session, 'getSnapshot').mockReturnValue(changed);
  });
  await expect(
    runReviewSpeechQueue(session, plan, new AbortController().signal, { ready, progress: vi.fn() })
  ).rejects.toThrow('stale');
  expect(mocks.generate).toHaveBeenCalledTimes(1);
});

it('disposes an in-flight result returned after cancellation before ownership handoff', async () => {
  const { session, plan, previews } = fixture();
  const controller = new AbortController();
  mocks.generate.mockImplementation(async () => {
    controller.abort();
    return previews[0];
  });
  const ready = vi.fn();
  await expect(
    runReviewSpeechQueue(session, plan, controller.signal, { ready, progress: vi.fn() })
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect(ready).not.toHaveBeenCalled();
  expect(mocks.cleanup).toHaveBeenCalledExactlyOnceWith(previews[0]);
});
