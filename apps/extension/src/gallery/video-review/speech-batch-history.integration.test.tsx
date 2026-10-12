// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { createRecognitionFixture } from '../../workflows/video-review/recognition.test-support';
import { parseVideoWorkspace } from '../../composition/persistence/review-workspaces/parser';
import {
  reviewSpeechGeometry,
  type ReviewSpeechPreview,
} from '../../workflows/video-review/speech-publication';
import { reviewSpeechTextSignature } from '../../features/video/review/speech-transcript';
import { createReviewSpeechEditGuard } from './speech-edit-guard';
import { useReviewSpeech } from './use-speech';

const assets = vi.hoisted(() => ({ prepare: vi.fn() }));
vi.mock('../../composition/persistence/projects', () => ({ prepareProjectAsset: assets.prepare }));
vi.mock('../../composition/persistence/projects/voiceover-publication-lock', () => ({
  withVoiceoverAttachmentLock: (_id: string, operation: () => Promise<void>) => operation(),
}));
vi.mock('../../workflows/ai-settings/query', () => ({
  requestAIModelSelectionBootstrap: async () => ({
    models: [],
    providers: [],
    defaultModelId: null,
    chromeAiEnabled: false,
    globalSystemPrompt: '',
  }),
}));
vi.mock('../../workflows/video-review/asset-bytes', () => ({
  resolveReviewAssetBytes: async () => null,
}));

let root: Root | undefined;
let host: HTMLDivElement | undefined;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
});

function preparedAsset(id: string) {
  return {
    id,
    protect: vi.fn(async () => undefined),
    publish: vi.fn(async () => undefined),
    cancel: vi.fn(async () => undefined),
  };
}

async function speechBatchHarness() {
  const { session, deps } = createRecognitionFixture(12);
  const profile = { modelId: 'model', voiceId: 'voice', responseFormat: 'wav' as const };
  const before = session.getSnapshot().document.advancedContent;
  const clips = Array.from({ length: 2 }, (_, index) => ({
    id: `voice-${index}`,
    assetId: `project-asset:voice-${index}`,
    timelineStart: index * 4,
    sourceOffset: 0,
    duration: 2,
    volume: 1,
    muted: false,
    fadeIn: 0,
    fadeOut: 0,
    transcript: {
      version: 1 as const,
      phrases: [
        {
          id: `phrase-${index}`,
          start: 0,
          end: 2,
          text: 'Synthetic phrase.',
          originalText: 'Synthetic phrase.',
          revision: 0,
          alignment: 'range' as const,
        },
      ],
      replacements: [],
      profile,
    },
  }));
  await session.commitDurable({
    id: 'seed-voices',
    at: 1,
    target: 'advancedContent',
    before,
    after: { ...before, audio: { ...before.audio, voiceover: clips } },
  });
  deps.commitVideoWorkspace.mockClear();
  assets.prepare.mockReset();
  const prepared: ReturnType<typeof preparedAsset>[] = [];
  assets.prepare.mockImplementation(async () => {
    const asset = preparedAsset(`prepared-${assets.prepare.mock.calls.length}`);
    prepared.push(asset);
    return asset;
  });
  const previews: ReviewSpeechPreview[] = clips.map((clip, index) => {
    const phrase = clip.transcript.phrases[0]!;
    const target = { kind: 'voiceover' as const, clipId: clip.id };
    return {
      blob: new Blob(['synthetic speech'], { type: 'audio/wav' }),
      url: `blob:synthetic-${index}`,
      createdAt: Date.now(),
      expiresAt: Date.now() + 600_000,
      geometry: reviewSpeechGeometry(session, target),
      scope: {
        workspaceId: session.getSnapshot().snapshot.workspace.aggregateId,
        workspaceRevision: session.getSnapshot().snapshot.workspace.revision,
        target,
        assetId: clip.assetId,
        nativeStart: 0,
        nativeEnd: 2,
      },
      staged: { id: `synthetic-${index}`, mimeType: 'audio/wav', size: 16 },
      replacement: {
        id: `replacement-${index}`,
        assetId: `project-asset:preview-${index}`,
        phraseId: phrase.id,
        revision: 0,
        start: 0,
        end: 2,
        text: phrase.text,
        duration: 1,
        profile,
        textSignature: reviewSpeechTextSignature(phrase.text, profile),
      },
    };
  });
  let current: ReturnType<typeof useReviewSpeech> | undefined;
  const guard = createReviewSpeechEditGuard(() => undefined);
  function Harness() {
    current = useReviewSpeech({
      session,
      target: { kind: 'voiceover', clipId: 'voice-0' },
      beforeAction: (operation) => {
        void guard.perform(operation);
      },
      flushAdvanced: () => session.flush(),
      registerSpeechFlush: guard.register,
    });
    return null;
  }
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root?.render(<Harness />));
  return {
    session,
    deps,
    previews,
    prepared,
    current: () => current!,
    apply: async (error?: string) => {
      await act(async () => {
        current?.apply(previews);
      });
      await vi.waitFor(async () => {
        await act(async () => {
          await Promise.resolve();
        });
        if (error) expect(current?.error).toBe(error);
        else
          expect(
            session
              .getSnapshot()
              .document.advancedContent.audio.voiceover.map(
                (clip) => clip.transcript?.replacements.length
              )
          ).toEqual([1, 1]);
        expect(current?.running).toBe(false);
      });
    },
  };
}

it('accepts two speech targets through the actual Apply command as one Undo/Redo action', async () => {
  const { session, deps, apply } = await speechBatchHarness();
  await apply();
  expect(deps.commitVideoWorkspace).toHaveBeenCalledOnce();
  await act(async () => {
    await session.history('undo');
  });
  expect(
    session
      .getSnapshot()
      .document.advancedContent.audio.voiceover.map((clip) => clip.transcript?.replacements.length)
  ).toEqual([0, 0]);
  await act(async () => {
    await session.history('redo');
  });
  expect(
    session
      .getSnapshot()
      .document.advancedContent.audio.voiceover.map((clip) => clip.transcript?.replacements.length)
  ).toEqual([1, 1]);
});

it.each(['prepare', 'protect'] as const)(
  'accepts neither target after second %s failure and supports explicit retry',
  async (phase) => {
    const { session, deps, apply, current, previews } = await speechBatchHarness();
    const first = preparedAsset('first');
    const second = preparedAsset('second');
    assets.prepare.mockResolvedValueOnce(first);
    if (phase === 'prepare') assets.prepare.mockRejectedValueOnce(new Error('second failure'));
    else {
      second.protect.mockRejectedValueOnce(new Error('second failure'));
      assets.prepare.mockResolvedValueOnce(second);
    }
    await apply('failed');
    expect(deps.commitVideoWorkspace).not.toHaveBeenCalled();
    expect(
      session
        .getSnapshot()
        .document.advancedContent.audio.voiceover.map(
          (clip) => clip.transcript?.replacements.length
        )
    ).toEqual([0, 0]);
    expect(first.cancel).toHaveBeenCalledOnce();
    if (phase === 'protect') expect(second.cancel).toHaveBeenCalledOnce();
    expect(current().error).toBe('failed');
    await apply();
    expect(deps.commitVideoWorkspace).toHaveBeenCalledOnce();
    expect(current().running).toBe(false);
    expect(previews).toHaveLength(2);
  }
);

it.each([false, true])(
  'retries metadata once without a second logical action, lost acknowledgement=%s',
  async (accepted) => {
    const { session, deps, apply, prepared } = await speechBatchHarness();
    const commit = deps.commitVideoWorkspace.getMockImplementation()!;
    deps.commitVideoWorkspace.mockImplementationOnce(async (request) => {
      if (accepted) await commit(request);
      throw new Error('metadata failed');
    });
    await apply('failed');
    if (accepted) for (const asset of prepared) expect(asset.cancel).not.toHaveBeenCalled();
    else for (const asset of prepared) expect(asset.cancel).toHaveBeenCalledOnce();
    await apply();
    expect(deps.commitVideoWorkspace).toHaveBeenCalledTimes(accepted ? 1 : 2);
    const acceptedAction = session.getSnapshot().snapshot.workspace.history.at(-1)!;
    for (const [request] of deps.commitVideoWorkspace.mock.calls)
      expect(request.operation).toMatchObject({ id: acceptedAction.id });
    expect(assets.prepare).toHaveBeenCalledTimes(accepted ? 2 : 4);
    expect(session.getSnapshot().snapshot.workspace.history).toHaveLength(2);
  }
);

it('finishes the same two private assets after the second required publication fails', async () => {
  const { deps, apply } = await speechBatchHarness();
  const first = preparedAsset('first');
  const second = preparedAsset('second');
  second.publish.mockRejectedValueOnce(new Error('publication failed'));
  assets.prepare.mockResolvedValueOnce(first).mockResolvedValueOnce(second);
  await apply('failed');
  expect(deps.commitVideoWorkspace).toHaveBeenCalledOnce();
  expect(first.cancel).not.toHaveBeenCalled();
  expect(second.cancel).not.toHaveBeenCalled();
  await apply();
  expect(deps.commitVideoWorkspace).toHaveBeenCalledOnce();
  expect(assets.prepare).toHaveBeenCalledTimes(2);
  expect(first.publish).toHaveBeenCalledTimes(2);
  expect(second.publish).toHaveBeenCalledTimes(2);
});

it('keeps ambiguous ready bytes and retries recovery without another commit', async () => {
  const { deps, apply, prepared } = await speechBatchHarness();
  const commit = deps.commitVideoWorkspace.getMockImplementation()!;
  deps.commitVideoWorkspace.mockImplementationOnce(async (request) => {
    await commit(request);
    deps.readVideoWorkspace.mockRejectedValueOnce(new Error('canonical unavailable'));
    throw new Error('lost acknowledgement');
  });
  await apply('failed');
  for (const asset of prepared) {
    expect(asset.cancel).not.toHaveBeenCalled();
    expect(asset.publish).not.toHaveBeenCalled();
  }
  await apply();
  expect(deps.commitVideoWorkspace).toHaveBeenCalledOnce();
  expect(assets.prepare).toHaveBeenCalledTimes(2);
  for (const asset of prepared) expect(asset.publish).toHaveBeenCalledOnce();
});

it('finishes adopted bytes when cancellation arrives during metadata acknowledgement', async () => {
  const { deps, apply, prepared, current } = await speechBatchHarness();
  const commit = deps.commitVideoWorkspace.getMockImplementation()!;
  deps.commitVideoWorkspace.mockImplementationOnce(async (request) => {
    const saved = await commit(request);
    current().cancel();
    return saved;
  });
  await apply();
  expect(deps.commitVideoWorkspace).toHaveBeenCalledOnce();
  expect(current().error).toBe('canceled');
  for (const asset of prepared) {
    expect(asset.cancel).not.toHaveBeenCalled();
    expect(asset.publish).toHaveBeenCalledOnce();
  }
});

it('finishes an acknowledged attachment even after its history receipt has been pruned', async () => {
  const { session, deps, apply } = await speechBatchHarness();
  const first = preparedAsset('first');
  const second = preparedAsset('second');
  second.publish.mockRejectedValueOnce(new Error('publication failed'));
  assets.prepare.mockResolvedValueOnce(first).mockResolvedValueOnce(second);
  await apply('failed');
  const saved = (await deps.readVideoWorkspace())!;
  const baseline = session.getSnapshot().document;
  const workspace = parseVideoWorkspace({
    ...saved.workspace,
    formatVersion: 2,
    baseline,
    advanced: { ...saved.workspace.advanced, ...baseline.advancedContent },
    history: [],
    cursor: 0,
    revision: saved.workspace.revision + 51,
  });
  expect(workspace).not.toBeNull();
  deps.readVideoWorkspace.mockResolvedValue({ ...saved, workspace: workspace! });
  await apply();
  expect(deps.commitVideoWorkspace).toHaveBeenCalledOnce();
  expect(assets.prepare).toHaveBeenCalledTimes(2);
  expect(second.publish).toHaveBeenCalledTimes(2);
  expect(first.cancel).not.toHaveBeenCalled();
});
