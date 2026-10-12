// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { VideoWorkspaceSnapshot } from '../../composition/persistence/review-workspaces/contracts';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
import {
  addReviewTextFragment,
  createReviewTextDocument,
} from '../../features/video/review/text-document';
import { parseReviewOperation } from '../../features/video/review/validation';
import { createVideoReviewSession } from '../../workflows/video-review/session';
import { useReviewAdvanced } from './use-advanced';
import { useReviewText } from './use-review-text';
import { ReviewTextPhrase } from './speech-phrase';
import {
  parseVideoWorkspaceTypingChange,
  prepareVideoWorkspaceTyping,
} from '../../composition/persistence/review-workspaces/typing';
import { replayReviewHistory, reviewDocumentBaseline } from '../../features/video/review/document';

let host: HTMLDivElement;
let root: Root;
let writer: ReturnType<typeof useReviewAdvanced>;
let editor: ReturnType<typeof useReviewText>;

function setup(autosave = true) {
  const advanced = createQuickEditAdvancedState();
  const added = addReviewTextFragment(createReviewTextDocument(), {
    id: 'phrase',
    start: 0,
    end: 3,
  });
  if (!added.ok) throw new Error('fixture');
  advanced.text = added.document;
  let stored: VideoWorkspaceSnapshot = {
    workspace: {
      aggregateId: 'video',
      sourceAssetId: 'source',
      formatVersion: 1,
      revision: 1,
      source: { duration: 4, width: 640, height: 360, mimeType: 'video/webm', size: 100 },
      advanced,
      history: [],
      cursor: 0,
      createdAt: 1,
      updatedAt: 1,
    },
    draft: null,
  };
  const commit = vi.fn(
    async (
      args:
        | Parameters<
            NonNullable<Parameters<typeof createVideoReviewSession>[1]>['commitVideoWorkspace']
          >[0]
        | Parameters<
            NonNullable<
              NonNullable<
                Parameters<typeof createVideoReviewSession>[1]
              >['saveVideoWorkspaceTyping']
            >
          >[0]
    ) => {
      if ('change' in args) {
        const change = parseVideoWorkspaceTypingChange(args.change);
        if (!change) throw new Error('Invalid typing capture');
        const document = replayReviewHistory(
          stored.workspace.history,
          stored.workspace.cursor,
          stored.workspace.source,
          reviewDocumentBaseline(stored.workspace)
        );
        const candidate = prepareVideoWorkspaceTyping(stored.workspace, document, change);
        stored = { ...stored, workspace: { ...candidate, revision: candidate.revision + 1 } };
        return structuredClone(stored);
      }
      const operation = parseReviewOperation(args.operation, 4);
      if (!operation) throw new Error('invalid operation');
      stored = {
        ...stored,
        workspace: {
          ...stored.workspace,
          revision: stored.workspace.revision + 1,
          history: [...stored.workspace.history, operation],
          cursor: stored.workspace.cursor + 1,
        },
      };
      return structuredClone(stored);
    }
  );
  const session = createVideoReviewSession(stored, {
    commitVideoWorkspace: commit,
    saveVideoWorkspaceTyping: commit,
    readVideoWorkspace: vi.fn(async () => structuredClone(stored)),
    saveVideoWorkspaceSnapshot: vi.fn(),
    saveVideoWorkspaceDraft: vi.fn(),
    saveVideoWorkspaceAdvanced: vi.fn(),
    moveVideoWorkspaceHistory: vi.fn(),
  });
  session.setAutosaveEnabled(autosave);
  function Harness() {
    writer = useReviewAdvanced(session);
    editor = useReviewText({
      document: writer.advanced.text,
      setText: writer.setText,
      endTyping: writer.endTyping,
      sourceDuration: 4,
      edits: session.getSnapshot().document.edits,
      sourceTime: 0,
      select: () => undefined,
      seek: () => undefined,
      pause: () => undefined,
    });
    return (
      <ReviewTextPhrase
        fragment={editor.document.fragments[0]!}
        editor={editor}
        expanded
        busy={false}
        limit={4}
        onJump={() => undefined}
      />
    );
  }
  act(() => root.render(<Harness />));
  return { session, commit };
}

it.each(['blur', 'Enter'])('closes the real phrase field group on %s', async (boundary) => {
  const { session } = setup();
  const field = host.querySelector('textarea')!;
  act(() => field.focus());
  type('First capture');
  await act(async () => vi.advanceTimersByTimeAsync(1000));
  act(() => field.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true })));
  type('Latest first capture');
  await act(async () => vi.advanceTimersByTimeAsync(1000));
  expect(session.getSnapshot().snapshot.workspace.history).toHaveLength(1);
  act(() => {
    if (boundary === 'blur') field.blur();
    else field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  });
  type('Second capture');
  await act(async () => vi.advanceTimersByTimeAsync(1000));
  const history = session.getSnapshot().snapshot.workspace.history;
  expect(history).toHaveLength(2);
  expect(history[0]?.id).not.toBe(history[1]?.id);
  expect(history[1]).toMatchObject({
    before: { text: { fragments: [{ text: 'Latest first capture' }] } },
    after: { text: { fragments: [{ text: 'Second capture' }] } },
  });
});

function type(value: string) {
  const input = host.querySelector('textarea')!;
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
      input,
      value
    );
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(input.value).toBe(value);
  expect(editor.document.fragments[0]?.text).toBe(value);
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.useFakeTimers();
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

it('coalesces normal typing gaps into one idle save without blocking visible input', async () => {
  const { session, commit } = setup();
  for (const value of ['П', 'Пр', 'При', 'Привет']) {
    type(value);
    await act(async () => vi.advanceTimersByTimeAsync(400));
    expect(commit).not.toHaveBeenCalled();
    expect(session.getSnapshot().pending).toBe(0);
  }
  await act(async () => vi.advanceTimersByTimeAsync(599));
  expect(commit).not.toHaveBeenCalled();
  await act(async () => vi.advanceTimersByTimeAsync(1));
  expect(commit).toHaveBeenCalledOnce();
  expect(session.getSnapshot().document.advancedContent.text?.fragments[0]?.text).toBe('Привет');
  expect(session.getSnapshot().snapshot.workspace.history).toHaveLength(1);
});

it('keeps one field-edit action across two acknowledged idle saves', async () => {
  const { session } = setup();
  type('First');
  await act(async () => vi.advanceTimersByTimeAsync(1000));
  type('Final');
  await act(async () => vi.advanceTimersByTimeAsync(1000));
  expect(session.getSnapshot().snapshot.workspace.history).toHaveLength(1);
  expect(session.getSnapshot().snapshot.workspace.history[0]).toMatchObject({
    target: 'advancedContent',
    before: { text: { fragments: [{ text: '' }] } },
    after: { text: { fragments: [{ text: 'Final' }] } },
  });
});

it('acknowledges a committed write after a lost response without appending again', async () => {
  const { session, commit } = setup();
  const persist = commit.getMockImplementation()!;
  commit.mockImplementationOnce(async (args) => {
    await persist(args);
    throw new Error('Lost acknowledgement');
  });
  type('Accepted');
  await act(async () => vi.advanceTimersByTimeAsync(1000));
  expect(writer.saveFailed).toBe(true);
  await act(async () => writer.retry());
  expect(commit).toHaveBeenCalledOnce();
  expect(session.getSnapshot().snapshot.workspace.history).toHaveLength(1);
  expect(writer.saveFailed).toBe(false);
  type('Next capture');
  await act(async () => vi.advanceTimersByTimeAsync(1000));
  expect(session.getSnapshot().snapshot.workspace.history).toHaveLength(1);
  expect(session.getSnapshot().document.advancedContent.text?.fragments[0]?.text).toBe(
    'Next capture'
  );
});

it('preserves a newer field capture while recovering the older accepted write', async () => {
  const { session, commit } = setup();
  const persist = commit.getMockImplementation()!;
  commit.mockImplementationOnce(async (args) => {
    await persist(args);
    throw new Error('Lost acknowledgement');
  });
  type('Accepted');
  await act(async () => vi.advanceTimersByTimeAsync(1000));
  type('Newer');
  expect(editor.document.fragments[0]?.text).toBe('Newer');
  await act(async () => writer.retry());
  expect(commit).toHaveBeenCalledTimes(2);
  expect(session.getSnapshot().snapshot.workspace.history).toHaveLength(1);
  expect(session.getSnapshot().document.advancedContent.text?.fragments[0]?.text).toBe('Newer');
});

it('keeps two sealed edits separate when neither has reached its first capture', async () => {
  const { session } = setup();
  type('First field session');
  act(() => writer.endTyping());
  type('Second field session');
  await act(async () => writer.flush());
  expect(session.getSnapshot().snapshot.workspace.history).toHaveLength(2);
  expect(session.getSnapshot().snapshot.workspace.history[1]).toMatchObject({
    target: 'advancedContent',
    before: { text: { fragments: [{ text: 'First field session' }] } },
    after: { text: { fragments: [{ text: 'Second field session' }] } },
  });
});

it('max-wait publication preserves the open field group through continuous input', async () => {
  const { session, commit } = setup();
  for (let index = 0; index < 12; index++) {
    type(`Continuous ${index}`);
    await act(async () => vi.advanceTimersByTimeAsync(500));
  }
  expect(commit).toHaveBeenCalled();
  await act(async () => vi.advanceTimersByTimeAsync(1000));
  expect(commit.mock.calls.length).toBeGreaterThan(1);
  expect(session.getSnapshot().snapshot.workspace.history).toHaveLength(1);
  expect(session.getSnapshot().document.advancedContent.text?.fragments[0]?.text).toBe(
    'Continuous 11'
  );
});

it.each([true, false])(
  'explicit flush preserves the newest text and autosave=%s',
  async (autosave) => {
    const { session, commit } = setup(autosave);
    type('Before');
    await act(async () => vi.advanceTimersByTimeAsync(400));
    type('Latest');
    await act(async () => writer.flush());
    expect(session.getSnapshot().document.advancedContent.text?.fragments[0]?.text).toBe('Latest');
    expect(session.getSnapshot().autosaveEnabled).toBe(autosave);
    expect(session.getSnapshot().dirty).toBe(!autosave);
    expect(commit).toHaveBeenCalledTimes(autosave ? 1 : 0);
    await act(async () => vi.advanceTimersByTimeAsync(2000));
    expect(commit).toHaveBeenCalledTimes(autosave ? 1 : 0);
  }
);

it('retains a failed idle save and retries the current text once', async () => {
  const { session, commit } = setup();
  commit.mockRejectedValueOnce(new Error('storage'));
  type('Retained draft');
  await act(async () => vi.advanceTimersByTimeAsync(1000));
  expect(writer.saveFailed).toBe(true);
  expect(editor.document.fragments[0]?.text).toBe('Retained draft');
  await act(async () => writer.retry());
  expect(writer.saveFailed).toBe(false);
  expect(commit).toHaveBeenCalledTimes(2);
  expect(session.getSnapshot().document.advancedContent.text?.fragments[0]?.text).toBe(
    'Retained draft'
  );
});

it('keeps the existing delay for non-typing text appearance edits', async () => {
  const { commit } = setup();
  act(() => editor.change('phrase', { showInVideo: false }));
  await act(async () => vi.advanceTimersByTimeAsync(250));
  expect(commit).toHaveBeenCalledOnce();
});

it.each([true, false])(
  'retains one local field group across idle acknowledgements with autosave=%s',
  async (autosave) => {
    const { session } = setup(autosave);
    type('One');
    await act(async () => vi.advanceTimersByTimeAsync(1000));
    type('Two');
    await act(async () => vi.advanceTimersByTimeAsync(1000));
    expect(session.getSnapshot().snapshot.workspace.history).toHaveLength(1);
    expect(session.getSnapshot().dirty).toBe(!autosave);
    expect(session.getSnapshot().document.advancedContent.text?.fragments[0]?.text).toBe('Two');
  }
);

it('does not drain new typing early when an older automatic write acknowledges', async () => {
  const { session, commit } = setup();
  const persist = commit.getMockImplementation()!;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  commit.mockImplementationOnce(async (args) => {
    await gate;
    return persist(args);
  });
  act(() => editor.change('phrase', { showInVideo: false }));
  await act(async () => vi.advanceTimersByTimeAsync(250));
  expect(commit).toHaveBeenCalledOnce();
  type('New typing');
  await act(async () => release());
  expect(commit).toHaveBeenCalledOnce();
  expect(editor.document.fragments[0]?.text).toBe('New typing');
  await act(async () => vi.advanceTimersByTimeAsync(400));
  type('Latest typing');
  await act(async () => vi.advanceTimersByTimeAsync(1000));
  expect(commit).toHaveBeenCalledTimes(2);
  expect(session.getSnapshot().document.advancedContent.text?.fragments[0]).toMatchObject({
    text: 'Latest typing',
    showInVideo: false,
  });
});
