import { expect, it } from 'vitest';
import { createQuickEditAdvancedState } from '../../../features/video/review/advanced/defaults';
import {
  applyReviewOperation,
  replayReviewHistory,
  reviewDocumentBaseline,
  reviewAdvancedContentBaseline,
} from '../../../features/video/review/document';
import type { VideoWorkspace } from './contracts';
import { createHistoryRetentionWorkspace } from './history-retention.test-support';
import { compactVideoWorkspaceHistory } from './history-retention';
import { inspectVideoWorkspace } from './parser';

it.each([0, 600, 1190])(
  'preserves current and every retained Undo/Redo result around cursor %i',
  (cursor) => {
    const admitted = inspectVideoWorkspace(
      createHistoryRetentionWorkspace({ fragments: 4, cursor })
    );
    if (!admitted.workspace || !admitted.document) throw new Error('Invalid scale proof');
    const { workspace, start } = compactVideoWorkspaceHistory(admitted.workspace);
    const restored = inspectVideoWorkspace(workspace);
    expect(restored.failure).toBeNull();
    expect(restored.document).toEqual(admitted.document);
    expect(workspace.history.length).toBeLessThanOrEqual(50);
    let expected = replayReviewHistory(
      admitted.workspace.history,
      start,
      workspace.source,
      reviewDocumentBaseline(admitted.workspace)
    );
    let actual = replayReviewHistory([], 0, workspace.source, reviewDocumentBaseline(workspace));
    for (let position = 0; position <= workspace.history.length; position++) {
      expect(actual).toEqual(expected);
      if (position < workspace.history.length) {
        actual = applyReviewOperation(actual, workspace.history[position]!, workspace.source);
        expected = applyReviewOperation(
          expected,
          admitted.workspace.history[start + position]!,
          workspace.source
        );
      }
    }
  }
);

it('saves a valid oversized compound action as current baseline with no Undo refusal', () => {
  const advanced = createQuickEditAdvancedState();
  const base = reviewAdvancedContentBaseline(advanced);
  const before = {
    ...base,
    text: {
      version: 1 as const,
      fragments: Array.from({ length: 500 }, (_, index) => ({
        id: `unicode-${index}`,
        start: 1,
        end: 2,
        text: '界'.repeat(1600),
        originalText: '界'.repeat(1600),
        revision: 0,
        timingRevision: 0,
        alignment: 'manual' as const,
        timeDomain: 'result' as const,
        showInVideo: false,
      })),
    },
  };
  const after = {
    ...before,
    background: {
      enabled: true as const,
      type: 'solid' as const,
      color: '#123456ff',
      layout: { padding: 12, cornerRadius: 8 },
    },
  };
  const input: VideoWorkspace = {
    aggregateId: 'recording:oversized',
    formatVersion: 1,
    sourceAssetId: 'synthetic-source',
    source: { duration: 12, width: 640, height: 360, mimeType: 'video/webm', size: 15 },
    revision: 1,
    createdAt: 1,
    updatedAt: 1,
    advanced: { ...before, ui: advanced.ui },
    history: [{ id: 'compound', at: 1, target: 'advancedContent', before, after }],
    cursor: 1,
  };
  const admitted = inspectVideoWorkspace(input);
  if (!admitted.workspace || !admitted.document) throw new Error('Invalid oversized proof');
  expect(
    new TextEncoder().encode(JSON.stringify(admitted.workspace.history)).byteLength
  ).toBeGreaterThan(8 * 1024 * 1024);
  const { workspace } = compactVideoWorkspaceHistory(admitted.workspace);
  expect(workspace.history).toEqual([]);
  expect(workspace.cursor).toBe(0);
  expect(inspectVideoWorkspace(workspace).document).toEqual(admitted.document);
  expect(workspace.baseline?.advancedContent.text?.fragments).toHaveLength(500);
});

it('rejects a malformed complete baseline even when its first operation would remove the defect', () => {
  const old = createHistoryRetentionWorkspace({ fragments: 4 });
  const admitted = inspectVideoWorkspace(old);
  if (!admitted.workspace) throw new Error('Invalid baseline proof');
  const { workspace } = compactVideoWorkspaceHistory(admitted.workspace);
  const baseline = workspace.baseline;
  if (!baseline) throw new Error('Missing complete baseline');
  expect(
    inspectVideoWorkspace({
      ...workspace,
      baseline: {
        ...baseline,
        edits: [...baseline.edits, { ...baseline.edits[0], id: 'overlapping' }],
      },
    }).workspace
  ).toBeNull();
  expect(
    inspectVideoWorkspace({
      ...workspace,
      baseline: { ...baseline, annotations: [...baseline.annotations, baseline.annotations[0]] },
    }).workspace
  ).toBeNull();
});

it('retains project metadata through compaction and complete baseline admission', () => {
  const input = {
    ...createHistoryRetentionWorkspace({ fragments: 4, cursor: 600 }),
    formatVersion: 3,
    project: {
      name: 'Permanent project',
      lifecycle: { storageClass: 'library', savedAt: 1, updatedAt: 2, trashedAt: 3 },
    },
  };
  const admitted = inspectVideoWorkspace(input);
  if (!admitted.workspace) throw new Error('Invalid project fixture');
  const compacted = compactVideoWorkspaceHistory(admitted.workspace);
  expect(compacted.start).toBeGreaterThan(0);
  expect(compacted.workspace.formatVersion).toBe(4);
  expect(inspectVideoWorkspace(compacted.workspace).workspace?.project).toEqual(input.project);
});
