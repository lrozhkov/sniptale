// @vitest-environment jsdom
import { act, useSyncExternalStore } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { VideoWorkspaceSnapshot } from '../../composition/persistence/review-workspaces/contracts';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
import type { ReviewOperation } from '../../features/video/review/types';
import { createVideoReviewSession } from '../../workflows/video-review/session';
import { createReviewSpeechEditGuard } from './speech-edit-guard';
import { useSpeechEdits } from './use-speech-edits';
let root: Root;
let host: HTMLDivElement;
let editor: ReturnType<typeof useSpeechEdits>;
function fixture() {
  let stored: VideoWorkspaceSnapshot = {
    workspace: {
      aggregateId: 'recording:r',
      sourceAssetId: 'source',
      formatVersion: 1,
      source: { duration: 4, width: 640, height: 360, mimeType: 'video/webm', size: 5 },
      revision: 1,
      cursor: 0,
      history: [],
      advanced: createQuickEditAdvancedState(),
      createdAt: 1,
      updatedAt: 1,
    },
    draft: null,
  };
  stored.workspace.advanced.audio.voiceover = [
    {
      id: 'clip',
      assetId: 'project-asset:original',
      timelineStart: 0,
      sourceOffset: 0,
      duration: 4,
      volume: 1,
      muted: false,
      fadeIn: 0,
      fadeOut: 0,
      transcript: {
        version: 1,
        replacements: [],
        profile: { modelId: 'model', voiceId: 'voice', responseFormat: 'wav' },
        phrases: [
          {
            id: 'phrase',
            start: 0,
            end: 4,
            originalText: 'Original',
            text: 'Original',
            revision: 0,
            alignment: 'range',
          },
        ],
      },
    },
  ];
  const commit = vi.fn(
    async (
      args: Parameters<
        typeof import('../../composition/persistence/review-workspaces/store').commitVideoWorkspace
      >[0]
    ) => {
      stored = {
        ...stored,
        workspace: {
          ...stored.workspace,
          revision: stored.workspace.revision + 1,
          history: [
            ...stored.workspace.history.slice(0, stored.workspace.cursor),
            args.operation as ReviewOperation,
          ],
          cursor: stored.workspace.cursor + 1,
        },
      };
      return stored;
    }
  );
  const session = createVideoReviewSession(stored, {
    saveVideoWorkspaceDraft: vi.fn(async () => stored),
    saveVideoWorkspaceSnapshot: vi.fn(async () => stored),
    saveVideoWorkspaceAdvanced: vi.fn(async () => stored),
    commitVideoWorkspace: commit,
    readVideoWorkspace: vi.fn(async () => stored),
    moveVideoWorkspaceHistory: vi.fn(async ({ direction }) => {
      stored = {
        ...stored,
        workspace: {
          ...stored.workspace,
          revision: stored.workspace.revision + 1,
          cursor: stored.workspace.cursor + (direction === 'undo' ? -1 : 1),
        },
      };
      return stored;
    }),
  });
  const guard = createReviewSpeechEditGuard(vi.fn());
  function Harness() {
    const state = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
    editor = useSpeechEdits({
      session,
      target: { kind: 'voiceover' as const, clipId: 'clip' },
      durable: state.document.advancedContent.audio.voiceover[0]?.transcript,
      catalog: undefined,
      beforeAction: (action) => {
        void guard.perform(action);
      },
      flushAdvanced: async () => undefined,
      registerSpeechFlush: guard.register,
      invalidate: vi.fn(),
      onError: vi.fn(),
    });
    return <span>{editor.transcript.phrases[0]?.text}</span>;
  }
  return {
    Harness,
    session,
    guard,
    commit,
    transcript: () =>
      session.getSnapshot().document.advancedContent.audio.voiceover[0]!.transcript!,
    stored: () => stored,
  };
}
beforeEach(() => {
  vi.useFakeTimers();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
});
it('coalesces a typing burst into one real history operation and Undo restores the original', async () => {
  const { Harness, commit, session, transcript, stored } = fixture();
  await act(async () => root.render(<Harness />));
  await act(async () => editor.editPhrase('phrase', { text: 'O' }));
  await act(async () => vi.advanceTimersByTimeAsync(100));
  await act(async () => editor.editPhrase('phrase', { text: 'One' }));
  await act(async () => vi.advanceTimersByTimeAsync(100));
  await act(async () => editor.editPhrase('phrase', { text: 'One final edit' }));
  expect(host.textContent).toBe('One final edit');
  expect(commit).not.toHaveBeenCalled();
  await act(async () => vi.advanceTimersByTimeAsync(299));
  expect(commit).not.toHaveBeenCalled();
  await act(async () => vi.advanceTimersByTimeAsync(1));
  expect(commit).toHaveBeenCalledOnce();
  expect(stored().workspace.history).toHaveLength(1);
  expect(transcript().phrases[0]).toMatchObject({ text: 'One final edit', revision: 1 });
  await act(async () => session.history('undo'));
  expect(transcript().phrases[0]).toMatchObject({ text: 'Original', revision: 0 });
  expect(host.textContent).toBe('Original');
});
it('navigation flushes the latest typing immediately and cancels the delayed save', async () => {
  const { Harness, guard, commit, transcript } = fixture();
  await act(async () => root.render(<Harness />));
  await act(async () => {
    editor.editPhrase('phrase', { text: 'First' });
    editor.editPhrase('phrase', { text: 'Latest' });
  });
  expect(commit).not.toHaveBeenCalled();
  const leave = vi.fn(() => expect(transcript().phrases[0]?.text).toBe('Latest'));
  await act(async () => guard.perform(leave));
  expect(leave).toHaveBeenCalledOnce();
  expect(commit).toHaveBeenCalledOnce();
  await act(async () => vi.advanceTimersByTimeAsync(1000));
  expect(commit).toHaveBeenCalledOnce();
});

it('keeps an in-flight head immutable while coalescing the next text burst', async () => {
  const { Harness, commit, guard, transcript, stored } = fixture();
  const persist = commit.getMockImplementation()!;
  let release: () => void = () => undefined;
  const blocked = new Promise<void>((done) => {
    release = done;
  });
  commit.mockImplementationOnce(async (args) => {
    await blocked;
    return persist(args);
  });
  await act(async () => root.render(<Harness />));
  await act(async () => editor.editPhrase('phrase', { text: 'In flight' }));
  await act(async () => vi.advanceTimersByTimeAsync(300));
  expect(commit).toHaveBeenCalledOnce();
  await act(async () => {
    editor.editPhrase('phrase', { text: 'Next' });
    editor.editPhrase('phrase', { text: 'Latest pending' });
  });
  expect(host.textContent).toBe('Latest pending');
  expect(commit).toHaveBeenCalledOnce();
  await act(async () => {
    release();
    await guard.flush();
  });
  expect(commit).toHaveBeenCalledTimes(2);
  expect(stored().workspace.history).toHaveLength(2);
  expect(transcript().phrases[0]).toMatchObject({ text: 'Latest pending', revision: 2 });
  const first = commit.mock.calls[0]![0].operation as Extract<
    ReviewOperation,
    { target: 'advancedContent' }
  >;
  expect(first.after.audio.voiceover[0]?.transcript?.phrases[0]?.text).toBe('In flight');
});

it('retains failed text, coalesces later typing separately and retries both edits', async () => {
  const { Harness, commit, guard, transcript, session, stored } = fixture();
  commit.mockRejectedValueOnce(new Error('storage failed'));
  await act(async () => root.render(<Harness />));
  await act(async () => editor.editPhrase('phrase', { text: 'Failed draft' }));
  await act(async () => vi.advanceTimersByTimeAsync(300));
  expect(editor.dirty).toBe(true);
  expect(transcript().phrases[0]?.text).toBe('Original');
  await act(async () => {
    editor.editPhrase('phrase', { text: 'Newer' });
    editor.editPhrase('phrase', { text: 'Newest draft' });
  });
  expect(host.textContent).toBe('Newest draft');
  await act(async () => guard.flush());
  expect(commit).toHaveBeenCalledTimes(3);
  expect(stored().workspace.history).toHaveLength(2);
  expect(transcript().phrases[0]).toMatchObject({ text: 'Newest draft', revision: 2 });
  expect(editor.dirty).toBe(false);
  await act(async () => session.history('undo'));
  expect(transcript().phrases[0]?.text).toBe('Failed draft');
  await act(async () => session.history('undo'));
  expect(transcript().phrases[0]?.text).toBe('Original');
});

it('preserves text, structural, and profile edit ordering with immediate explicit flush', async () => {
  const { Harness, commit, transcript, stored } = fixture();
  await act(async () => root.render(<Harness />));
  await act(async () => editor.editPhrase('phrase', { text: 'Before timing' }));
  await act(async () => editor.editPhrase('phrase', { end: 3 }));
  expect(commit).toHaveBeenCalledTimes(2);
  await act(async () => editor.editPhrase('phrase', { text: 'Before profile' }));
  await act(async () =>
    editor.changeProfile({ modelId: 'model', voiceId: 'new voice', responseFormat: 'wav' })
  );
  expect(commit).toHaveBeenCalledTimes(4);
  expect(stored().workspace.history).toHaveLength(4);
  expect(transcript().phrases[0]).toMatchObject({ text: 'Before profile', end: 3, revision: 3 });
  expect(transcript().profile?.voiceId).toBe('new voice');
});
