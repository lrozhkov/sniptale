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
      args: Parameters<
        NonNullable<Parameters<typeof createVideoReviewSession>[1]>['commitVideoWorkspace']
      >[0]
    ) => {
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
      sourceDuration: 4,
      edits: session.getSnapshot().document.edits,
      sourceTime: 0,
      select: () => undefined,
      seek: () => undefined,
      pause: () => undefined,
    });
    return (
      <textarea
        value={editor.document.fragments[0]?.text ?? ''}
        onChange={(event) => editor.change('phrase', { text: event.target.value })}
      />
    );
  }
  act(() => root.render(<Harness />));
  return { session, commit };
}

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
