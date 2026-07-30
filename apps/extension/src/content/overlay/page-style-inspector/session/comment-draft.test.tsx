// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { browserAnnotationSession } from '../../../parser/page-preparation/annotations';
import type { PageStyleSelectionSnapshot } from '../runtime/properties';

const commentMocks = vi.hoisted(() => ({
  commit: vi.fn(),
  read: vi.fn(),
}));

vi.mock('../runtime/comment', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../runtime/comment')>()),
  commitPropertiesComment: commentMocks.commit,
  readPropertiesComment: commentMocks.read,
}));

vi.mock('../../../selection/quick-edit-runtime/page-style/annotation', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../selection/quick-edit-runtime/page-style/annotation')
  >()),
  createPageStyleAnnotationEvidence: vi.fn((element: Element) => ({
    fileLabel: element.id,
    frame: { kind: 'top-document' },
    locator: `#${element.id}`,
    nodePosition: { x: 1, y: 2 },
    pageUrl: 'https://example.test',
    targetPath: element.localName,
    targetSelector: `#${element.id}`,
    targetText: '',
    viewport: { height: 720, width: 1280 },
  })),
}));

import { usePageStyleCommentDraft } from './comment-draft';

let host: HTMLDivElement;
let root: Root | null;
let latest: ReturnType<typeof usePageStyleCommentDraft> | null = null;
let comments: Map<Element, { comment: string; marker: number | null }>;
let nextMarker = 1;

function createSelection(id: string): PageStyleSelectionSnapshot {
  const element = document.createElement('div');
  element.id = id;
  return {
    domPath: `div#${id}`,
    element,
    kind: 'block',
    patch: { assets: [], declarations: [] },
    selector: { locator: `#${id}` },
    selectorLabel: `div#${id}`,
    tagName: 'div',
    textPreview: '',
  };
}

function Harness(props: { open: boolean; selection: PageStyleSelectionSnapshot | null }) {
  latest = usePageStyleCommentDraft(props);
  return null;
}

async function renderHarness(props: Parameters<typeof Harness>[0]) {
  await act(async () => {
    root?.render(<Harness {...props} />);
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  browserAnnotationSession.resetForDocument();
  comments = new Map();
  nextMarker = 1;
  commentMocks.read.mockImplementation(
    (target: Element) => comments.get(target) ?? { comment: '', marker: null }
  );
  commentMocks.commit.mockImplementation(
    (args: { comment: string; target: Element }): number | null => {
      if (args.comment === '') {
        comments.delete(args.target);
        return null;
      }
      const current = comments.get(args.target);
      const marker = current?.marker ?? nextMarker++;
      comments.set(args.target, { comment: args.comment, marker });
      return marker;
    }
  );
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  latest = null;
  browserAnnotationSession.resetForDocument();
  host.remove();
  document.body.replaceChildren();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it('deduplicates blur, panel close, and unmount into one commit', async () => {
  const selection = createSelection('first');
  await renderHarness({ open: true, selection });

  act(() => latest?.updateCommentDraft('One commit'));
  act(() => latest?.commitComment());
  await renderHarness({ open: false, selection });
  act(() => root?.unmount());
  root = null;

  expect(commentMocks.commit).toHaveBeenCalledTimes(1);
  expect(commentMocks.commit).toHaveBeenCalledWith(
    expect.objectContaining({ comment: 'One commit', target: selection.element })
  );
});

it('commits the previous target once before hydrating the next target', async () => {
  const first = createSelection('first');
  const second = createSelection('second');
  comments.set(second.element, { comment: 'Second comment', marker: 7 });
  await renderHarness({ open: true, selection: first });

  act(() => latest?.updateCommentDraft('First comment'));
  await renderHarness({ open: true, selection: second });

  expect(commentMocks.commit).toHaveBeenCalledTimes(1);
  expect(commentMocks.commit).toHaveBeenCalledWith(
    expect.objectContaining({ comment: 'First comment', target: first.element })
  );
  expect(latest?.commentDraft).toBe('Second comment');
  expect(latest?.commentMarker).toBe(7);
});

it('defers an IME blur commit until composition ends', async () => {
  const selection = createSelection('ime');
  await renderHarness({ open: true, selection });

  act(() => {
    latest?.startCommentComposition();
    latest?.updateCommentDraft('Составной ввод');
  });
  act(() => {
    expect(latest?.commitComment()).toBe(false);
  });
  expect(commentMocks.commit).not.toHaveBeenCalled();

  act(() => latest?.endCommentComposition('Составной ввод'));

  expect(commentMocks.commit).toHaveBeenCalledTimes(1);
  expect(commentMocks.commit).toHaveBeenCalledWith(
    expect.objectContaining({ comment: 'Составной ввод', target: selection.element })
  );
});

it('finalizes IME state before one terminal mode-close commit', async () => {
  const selection = createSelection('ime-close');
  await renderHarness({ open: true, selection });

  act(() => {
    latest?.startCommentComposition();
    latest?.updateCommentDraft('Закрытие режима');
    expect(latest?.commitComment()).toBe(false);
  });
  expect(commentMocks.commit).not.toHaveBeenCalled();

  await renderHarness({ open: false, selection });

  expect(commentMocks.commit).toHaveBeenCalledTimes(1);
  expect(commentMocks.commit).toHaveBeenCalledWith(
    expect.objectContaining({ comment: 'Закрытие режима', target: selection.element })
  );
});

it('deduplicates a failed terminal attempt across selection teardown and unmount', async () => {
  const selection = createSelection('failed-close');
  commentMocks.commit.mockImplementationOnce(() => {
    throw new Error('failed once');
  });
  await renderHarness({ open: true, selection });
  act(() => latest?.updateCommentDraft('Keep this draft'));

  await renderHarness({ open: false, selection });
  await renderHarness({ open: false, selection: null });
  expect(commentMocks.commit).toHaveBeenCalledTimes(1);
  expect(latest?.commentCommitFailed).toBe(true);
  expect(latest?.commentDraft).toBe('Keep this draft');

  await renderHarness({ open: true, selection });
  act(() => expect(latest?.commitComment()).toBe(true));
  expect(commentMocks.commit).toHaveBeenCalledTimes(2);
  expect(latest?.commentDraft).toBe('Keep this draft');

  act(() => root?.unmount());
  root = null;
  expect(commentMocks.commit).toHaveBeenCalledTimes(2);
});

it('normalizes an all-whitespace draft to an empty comment removal', async () => {
  const selection = createSelection('remove');
  comments.set(selection.element, { comment: 'Remove me', marker: 4 });
  await renderHarness({ open: true, selection });

  act(() => latest?.updateCommentDraft('   '));
  act(() => latest?.commitComment());

  expect(commentMocks.commit).toHaveBeenCalledWith(
    expect.objectContaining({ comment: '', target: selection.element })
  );
  expect(latest?.commentDraft).toBe('');
  expect(latest?.commentMarker).toBeNull();
});

it('does not commit an unchanged hydrated draft', async () => {
  const selection = createSelection('stable');
  comments.set(selection.element, { comment: 'Stable', marker: 2 });
  await renderHarness({ open: true, selection });

  act(() => latest?.commitComment());

  expect(commentMocks.commit).not.toHaveBeenCalled();
});

it('rehydrates a clean draft after an external history/session revision', async () => {
  const selection = createSelection('history');
  comments.set(selection.element, { comment: 'Before undo', marker: 2 });
  await renderHarness({ open: true, selection });
  comments.set(selection.element, { comment: 'Restored', marker: 1 });

  act(() => {
    browserAnnotationSession.setComment({
      comment: 'revision',
      evidence: {
        fileLabel: 'revision',
        frame: { kind: 'top-document' },
        locator: '#revision',
        nodePosition: { x: 0, y: 0 },
        pageUrl: 'https://example.test',
        targetPath: 'div',
        targetSelector: '#revision',
        targetText: '',
        viewport: { height: 720, width: 1280 },
      },
      target: document.createElement('div'),
    });
  });

  expect(latest?.commentDraft).toBe('Restored');
  expect(latest?.commentMarker).toBe(1);
});

it('keeps a failed draft recoverable and blocks explicit close', async () => {
  const selection = createSelection('failure');
  commentMocks.commit.mockImplementation(() => {
    throw new Error('failed');
  });
  await renderHarness({ open: true, selection });

  act(() => latest?.updateCommentDraft('Retry me'));
  act(() => {
    expect(latest?.commitComment()).toBe(false);
  });

  expect(latest?.commentCommitFailed).toBe(true);
  expect(latest?.commentDraft).toBe('Retry me');
});
