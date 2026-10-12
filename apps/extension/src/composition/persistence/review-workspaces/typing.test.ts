import { expect, it } from 'vitest';
import { createQuickEditAdvancedState } from '../../../features/video/review/advanced/defaults';
import { editReviewTextFragment } from '../../../features/video/review/text-document';
import {
  replayReviewHistory,
  reviewDocumentBaseline,
} from '../../../features/video/review/document';
import type { VideoWorkspace } from './contracts';
import { parseVideoWorkspace } from './parser';
import { compactVideoWorkspaceHistory } from './history-retention';
import {
  parseVideoWorkspaceTypingChange,
  prepareVideoWorkspaceTyping,
  withoutVideoWorkspaceTyping,
} from './typing';

const firstAction = '00000000-0000-4000-8000-000000000001';
const secondAction = '00000000-0000-4000-8000-000000000002';
const target = { kind: 'text' as const, fragmentId: 'phrase-0', field: 'text' as const };

function initial(fragments = 1): VideoWorkspace {
  const advanced = createQuickEditAdvancedState();
  advanced.text = {
    version: 1,
    fragments: Array.from({ length: fragments }, (_, index) => ({
      id: `phrase-${index}`,
      start: 0,
      end: 2,
      text: fragments > 1 ? '界'.repeat(1600) : '',
      originalText: fragments > 1 ? '界'.repeat(1600) : '',
      revision: 0,
      timingRevision: 0,
      alignment: 'manual',
      timeDomain: 'result',
      showInVideo: false,
    })),
  };
  const workspace = parseVideoWorkspace({
    aggregateId: 'recording:typing',
    sourceAssetId: 'source',
    formatVersion: 1,
    source: { duration: 4, width: 640, height: 360, size: 15, mimeType: 'video/webm' },
    revision: 1,
    createdAt: 1,
    updatedAt: 1,
    advanced,
    history: [],
    cursor: 0,
  });
  if (!workspace) throw new Error('Invalid initial fixture');
  return workspace;
}

function edit(
  workspace: VideoWorkspace,
  text: string,
  continuation: boolean,
  actionId = firstAction
) {
  const document = replayReviewHistory(
    workspace.history,
    workspace.cursor,
    workspace.source,
    reviewDocumentBaseline(workspace)
  );
  const before = document.advancedContent;
  if (!before.text) throw new Error('Missing text fixture');
  const changed = editReviewTextFragment(before.text, target.fragmentId, { text });
  if (!changed.ok) throw new Error('Invalid text fixture');
  const change = parseVideoWorkspaceTypingChange({
    actionId,
    writeId: crypto.randomUUID(),
    target,
    continuation,
    before,
    after: { ...before, text: changed.document },
    at: 2,
  });
  if (!change) throw new Error('Invalid typing fixture');
  return { change, candidate: prepareVideoWorkspaceTyping(workspace, document, change) };
}

it('keeps the first identity, timestamp and before across acknowledged writes, with different write captures', () => {
  const first = edit(initial(), 'One', false);
  const second = edit(first.candidate, 'Final', true);
  expect(second.candidate.history).toHaveLength(1);
  expect(second.candidate.history[0]).toMatchObject({
    id: firstAction,
    at: 2,
    before: { text: { fragments: [{ text: '' }] } },
    after: { text: { fragments: [{ text: 'Final' }] } },
  });
  expect(second.change.writeId).not.toBe(first.change.writeId);
  expect(parseVideoWorkspace(second.candidate)).not.toBeNull();
  const undo = { ...withoutVideoWorkspaceTyping(second.candidate), cursor: 0 };
  expect(
    replayReviewHistory(undo.history, undo.cursor, undo.source, reviewDocumentBaseline(undo))
      .advancedContent.text?.fragments[0]?.text
  ).toBe('');
});

it('refuses continuation after another command instead of appending a partial group', () => {
  const first = edit(initial(), 'One', false);
  expect(() => edit(withoutVideoWorkspaceTyping(first.candidate), 'Final', true)).toThrow(
    'expired'
  );
  const next = edit(first.candidate, 'Second action', false, secondAction);
  expect(next.candidate.history).toHaveLength(2);
  expect(next.candidate.history.map((operation) => operation.id)).toEqual([
    firstAction,
    secondAction,
  ]);
});

it('retains an oversized group as current baseline without resurrecting its suffix after shrinking', () => {
  const first = edit(initial(429), '界'.repeat(16000), false);
  const compacted = compactVideoWorkspaceHistory(first.candidate).workspace;
  expect(compacted.history).toEqual([]);
  expect(compacted.typing?.operationId).toBeNull();
  expect(parseVideoWorkspace(compacted)).not.toBeNull();
  const second = edit(compacted, 'Short', true);
  const hypothetical = [{ ...first.candidate.history[0], after: second.change.after }];
  expect(new TextEncoder().encode(JSON.stringify(hypothetical)).byteLength).toBeLessThanOrEqual(
    8 * 1024 * 1024
  );
  expect(second.candidate.history).toEqual([]);
  expect(second.candidate.baseline?.advancedContent.text?.fragments[0]?.text).toBe('Short');
  expect(parseVideoWorkspace(second.candidate)).not.toBeNull();
});

it('rejects field captures that also alter gain, geometry or another fragment', () => {
  const { change } = edit(initial(), 'One', false);
  expect(
    parseVideoWorkspaceTypingChange({
      ...change,
      after: {
        ...change.after,
        audio: { ...change.after.audio, original: { muted: true, volume: 0.5 } },
      },
    })
  ).toBeNull();
  expect(
    parseVideoWorkspaceTypingChange({
      ...change,
      after: {
        ...change.after,
        text: {
          ...change.after.text,
          fragments: change.after.text!.fragments.map((fragment) => ({ ...fragment, start: 0.5 })),
        },
      },
    })
  ).toBeNull();
});

it('rejects forged tail and baseline-only markers before mutation', () => {
  const { candidate } = edit(initial(), 'One', false);
  expect(
    parseVideoWorkspace({ ...candidate, typing: { ...candidate.typing, operationId: null } })
  ).toBeNull();
  expect(
    parseVideoWorkspace({ ...candidate, typing: { ...candidate.typing, writeId: 'invalid' } })
  ).toBeNull();
  expect(parseVideoWorkspace({ ...candidate, cursor: 0 })).toBeNull();
});
