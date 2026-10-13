// @vitest-environment jsdom
import { act, useSyncExternalStore } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { VideoWorkspaceSnapshot } from '../../composition/persistence/review-workspaces/contracts';
import { parseVideoWorkspace } from '../../composition/persistence/review-workspaces/parser';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
import { parseReviewOperation } from '../../features/video/review/validation';
import { applyLocalReviewChange } from '../../workflows/video-review/local-session';
import { createVideoReviewSession } from '../../workflows/video-review/session';
import { useReviewAdvancedContent } from './use-advanced-content';
import { useReviewRecognition } from './use-recognition';
import { ReviewOriginalSpeechPanel } from './speech-panel';
import { translate } from '../../platform/i18n';

const remote = vi.hoisted(() => ({ job: vi.fn() }));
vi.mock('../../workflows/video-review/speech-client', () => ({ runReviewSpeechJob: remote.job }));
vi.mock('../../workflows/video-review/speech-audio', () => ({
  planReviewSpeechChunks: async (
    _source: unknown,
    ranges: readonly { start: number; end: number }[]
  ) => ranges,
  extractReviewSpeechWav: async () => new Blob(['pcm']),
  reviewSpeechWavIsSilent: async () => false,
}));
vi.mock('../../workflows/ai-settings/query', () => ({
  requestAIModelSelectionBootstrap: async () => ({
    models: [{ id: 'model', displayName: 'Transcription', providerId: 'provider' }],
    providers: [{ id: 'provider', name: 'Provider' }],
    defaultModelId: 'model',
    chromeAiEnabled: false,
    globalSystemPrompt: '',
  }),
}));

function fixture() {
  let commitWait: Promise<void> | undefined;
  let stored: VideoWorkspaceSnapshot = {
    workspace: {
      aggregateId: 'video',
      sourceAssetId: 'source',
      formatVersion: 1,
      revision: 1,
      source: { duration: 10, width: 640, height: 360, mimeType: 'video/webm', size: 5 },
      advanced: createQuickEditAdvancedState(),
      history: [],
      cursor: 0,
      createdAt: 1,
      updatedAt: 1,
    },
    draft: null,
  };
  const commit = vi.fn(
    async (
      request: Parameters<
        typeof import('../../composition/persistence/review-workspaces/store').commitVideoWorkspace
      >[0]
    ) => {
      await commitWait;
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
  );
  const session = createVideoReviewSession(stored, {
    moveVideoWorkspaceHistory: async () => {
      throw new Error('unexpected fixture history route');
    },
    saveVideoWorkspaceAdvanced: async () => {
      throw new Error('unexpected fixture advanced route');
    },
    saveVideoWorkspaceDraft: async () => {
      throw new Error('unexpected fixture draft route');
    },
    commitVideoWorkspace: commit,
    readVideoWorkspace: vi.fn(async () => structuredClone(stored)),
    saveVideoWorkspaceSnapshot: vi.fn(async (request) => {
      const workspace = parseVideoWorkspace(request.workspace);
      if (!workspace || request.draft !== null) throw new Error('invalid fixture Save');
      stored = {
        workspace: { ...workspace, revision: stored.workspace.revision + 1 },
        draft: null,
      };
      return structuredClone(stored);
    }),
  });
  return {
    session,
    commit,
    holdCommit: () => {
      let release!: () => void;
      commitWait = new Promise<void>((resolve) => {
        release = resolve;
      });
      return release;
    },
  };
}

let host: HTMLDivElement;
let root: Root;
let recognition: ReturnType<typeof useReviewRecognition>;
let content: ReturnType<typeof useReviewAdvancedContent>;
function Probe({ session }: { session: ReturnType<typeof createVideoReviewSession> }) {
  const snapshot = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
    session.getSnapshot
  );
  content = useReviewAdvancedContent(session, snapshot.document.advancedContent);
  recognition = useReviewRecognition({
    session,
    target: { kind: 'original' },
    original: { file: new Blob(['source']), sourceAssetId: 'source' },
    beforeAction: (action) => action(),
    flushAdvanced: () => content.flush(),
    registerSpeechFlush: () => () => undefined,
  });
  return <div />;
}
function SourcePanelProbe({ session }: { session: ReturnType<typeof createVideoReviewSession> }) {
  const snapshot = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
    session.getSnapshot
  );
  content = useReviewAdvancedContent(session, snapshot.document.advancedContent);
  return (
    <ReviewOriginalSpeechPanel
      session={session}
      original={{ file: new Blob(['source']), sourceAssetId: 'source' }}
      beforeAction={(action) => action()}
      flushAdvanced={() => content.flush()}
      registerSpeechFlush={() => () => undefined}
      masterAudio={content.content.audio.original}
      masterDisabled={false}
      onMasterVolumeChange={(volume) =>
        content.commands.setAudio((audio) => ({
          ...audio,
          original: { ...audio.original, volume },
        }))
      }
    />
  );
}
function button(label: string) {
  const found = Array.from(host.querySelectorAll('button')).find(
    (node) => node.getAttribute('aria-label') === label
  );
  if (!found) throw new Error('Missing button: ' + label);
  return found;
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  remote.job.mockReset();
  remote.job.mockResolvedValue({ type: 'transcript', result: { text: 'Recognized.' } });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it.each([false, true])(
  'joins pending gain before absent receipt recovery, autosave=%s',
  async (autosave) => {
    const { session, commit } = fixture();
    session.setAutosaveEnabled(autosave);
    await act(async () => root.render(<Probe session={session} />));
    await act(async () => recognition.recognize('provider'));
    expect(recognition.proposal?.document.fragments).toHaveLength(1);
    commit.mockRejectedValueOnce(new Error('Apply failed'));
    await act(async () => recognition.apply());
    expect(recognition.error).toBe('failed');
    const receiptId = recognition.proposal!.receipt!.id;
    await act(async () =>
      content.commands.setAudio((audio) => ({
        ...audio,
        original: { ...audio.original, volume: 0.45 },
      }))
    );
    expect(content.pending).toBe(true);
    expect(content.content.audio.original.volume).toBe(0.45);
    expect(session.getSnapshot().document.advancedContent.audio.original.volume).toBe(1);
    await act(async () => recognition.apply());
    expect(recognition.accepted).toBe(true);
    await act(async () => vi.advanceTimersByTimeAsync(1000));
    expect(content.pending).toBe(false);
    expect(session.getSnapshot().document.advancedContent.audio.original.volume).toBe(0.45);
    expect(session.getSnapshot().document.advancedContent.text?.fragments).toHaveLength(1);
    expect(recognition.proposal!.receipt!.id).toBe(receiptId);
    expect((await session.readRetainedReviewOperation(receiptId))?.after).toMatchObject({
      audio: { original: { volume: 0.45 } },
      text: { fragments: [{ text: 'Recognized.' }] },
    });
    expect(remote.job).toHaveBeenCalledOnce();
  }
);

it.each([
  { autosave: false, retry: false },
  { autosave: true, retry: false },
  { autosave: false, retry: true },
  { autosave: true, retry: true },
])(
  'refuses source gain during durable Apply, autosave=$autosave, retry=$retry',
  async ({ autosave, retry }) => {
    const { session, commit, holdCommit } = fixture();
    session.setAutosaveEnabled(autosave);
    await act(async () => root.render(<SourcePanelProbe session={session} />));
    await act(async () =>
      button(
        translate(
          autosave
            ? 'gallery.videoReview.recognitionStart'
            : 'gallery.videoReview.recognitionSaveStart'
        )
      ).click()
    );
    await act(async () => button(translate('gallery.videoReview.speechConsentContinue')).click());
    const gain = () => button(translate('gallery.videoReview.volume') + ' decrease');
    expect(gain().disabled).toBe(false);
    const applyLabel = translate(
      autosave ? 'gallery.videoReview.recognitionApply' : 'gallery.videoReview.recognitionSaveApply'
    );
    if (retry) {
      commit.mockRejectedValueOnce(new Error('Apply failed'));
      await act(async () => button(applyLabel).click());
      expect(gain().disabled).toBe(false);
    }
    const release = holdCommit();
    await act(async () => button(applyLabel).click());
    expect(commit).toHaveBeenCalledTimes(retry ? 2 : 1);
    // A keyboard step is a real gain gesture after the buffer join, before acceptance acknowledgement.
    await act(async () => gain().click());
    await act(async () => release());
    await act(async () => vi.advanceTimersByTimeAsync(1000));
    expect(content.pending).toBe(false);
    expect(session.getSnapshot().document.advancedContent.text?.fragments).toHaveLength(1);
    expect(session.getSnapshot().document.advancedContent.audio.original.volume).toBe(1);
    expect(remote.job).toHaveBeenCalledOnce();
    expect(gain().disabled).toBe(false);
    await act(async () => gain().click());
    await act(async () => vi.advanceTimersByTimeAsync(1000));
    expect(session.getSnapshot().document.advancedContent.audio.original.volume).toBe(0.99);
    expect(session.getSnapshot().document.advancedContent.text?.fragments).toHaveLength(1);
  }
);
