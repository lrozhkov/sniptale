import { DEFAULT_WINDOW_HEADER } from '../../../features/browser-frame/header';
import { expect, it } from 'vitest';
import {
  createQuickEditAdvancedContent,
  createQuickEditAdvancedState,
} from '../../../features/video/review/advanced/defaults';
import { inspectVideoWorkspace } from './parser';
import {
  replayReviewHistory,
  reviewAdvancedContentBaseline,
} from '../../../features/video/review/document';

function workspace() {
  return {
    aggregateId: 'private-record',
    sourceAssetId: 'private-asset',
    formatVersion: 1,
    source: { duration: 10, width: 640, height: 360, size: 6, mimeType: 'video/webm' },
    revision: 1,
    createdAt: 1,
    updatedAt: 1,
    cursor: 0,
    history: [],
    advanced: createQuickEditAdvancedState(),
  };
}

it.each([0, 1, 2])(
  'returns the admitted document at cursor %s with complete redo validation',
  (cursor) => {
    const before = createQuickEditAdvancedContent();
    const muted = {
      ...before,
      audio: { ...before.audio, original: { ...before.audio.original, muted: true } },
    };
    const quieter = {
      ...muted,
      audio: { ...muted.audio, original: { ...muted.audio.original, volume: 0.5 } },
    };
    const raw = {
      ...workspace(),
      cursor,
      history: [
        { id: 'mute', at: 1, target: 'advancedContent', before, after: muted },
        { id: 'volume', at: 2, target: 'advancedContent', before: muted, after: quieter },
      ],
    };
    const original = structuredClone(raw);
    const result = inspectVideoWorkspace(raw);
    expect(result.failure).toBeNull();
    expect(result.workspace?.history).toHaveLength(2);
    expect(result.document?.advancedContent).toEqual([before, muted, quieter][cursor]);
    expect(raw).toEqual(original);
  }
);
it.each(['fixed', 'follow-video', undefined] as const)(
  'preserves schema 10 zoom policy %s when reopening the workspace',
  (zoomBehavior) => {
    const raw = workspace();
    const advanced = {
      ...raw.advanced,
      schemaVersion: 10,
      background: { enabled: false, ...(zoomBehavior ? { zoomBehavior } : {}) },
    };
    const result = inspectVideoWorkspace({ ...raw, advanced });
    expect(result.failure).toBeNull();
    expect(result.workspace?.advanced.background.zoomBehavior).toBe(zoomBehavior);
    expect(inspectVideoWorkspace(result.workspace).workspace).toEqual(result.workspace);
  }
);

it.each(['window', 'content'] as const)('reopens the new %s zoom policy', (zoomBehavior) => {
  const raw = workspace();
  const result = inspectVideoWorkspace({
    ...raw,
    advanced: { ...raw.advanced, background: { enabled: false, zoomBehavior } },
  });
  expect(result.failure).toBeNull();
  expect(result.workspace?.advanced.background.zoomBehavior).toBe(zoomBehavior);
});
it('identifies no-change history position in the retained redo suffix without content', () => {
  const content = createQuickEditAdvancedContent();
  const raw = {
    ...workspace(),
    history: [
      {
        id: 'private-operation',
        at: 1,
        target: 'advancedContent',
        before: content,
        after: content,
      },
    ],
  };
  const result = inspectVideoWorkspace(raw);
  expect(result.workspace).toBeNull();
  expect(result.document).toBeNull();
  expect(result.failure).toEqual({
    check: 'history-replay',
    reason: 'no-change',
    operationIndex: 0,
    target: 'advancedContent',
    cursor: 0,
    historyLength: 1,
  });
  expect(JSON.stringify(result.failure)).not.toMatch(/private|schemaVersion|regions/);
});
it('locates malformed and duplicate operations separately', () => {
  const operation = {
    id: 'private-operation',
    at: 1,
    target: 'annotation',
    before: null,
    after: { id: 'private-note', text: 'PRIVATE_CONTENT', anchor: { kind: 'point', time: 1 } },
  };
  expect(
    inspectVideoWorkspace({ ...workspace(), history: [operation, operation] }).failure
  ).toMatchObject({ check: 'history-operation', reason: 'duplicate-operation', operationIndex: 1 });
  expect(
    inspectVideoWorkspace({ ...workspace(), history: [{ secret: 'PRIVATE_CONTENT' }] }).failure
  ).toMatchObject({ check: 'history-operation', reason: 'invalid', operationIndex: 0 });
});
it('separates source and advanced-state validation while retaining strict admission', () => {
  expect(inspectVideoWorkspace({ ...workspace(), source: null }).failure?.check).toBe(
    'source-metadata'
  );
  expect(
    inspectVideoWorkspace({ ...workspace(), advanced: { schemaVersion: 999 } }).failure?.check
  ).toBe('advanced-state');
  expect(inspectVideoWorkspace(workspace()).failure).toBeNull();
});
it('bounds diagnostic counts and never copies arbitrary values', () => {
  const result = inspectVideoWorkspace({
    ...workspace(),
    cursor: 999999999,
    filename: 'PRIVATE_CONTENT',
  });
  expect(result.failure).toMatchObject({
    check: 'workspace-envelope',
    cursor: 1000000,
    historyLength: 0,
  });
  expect(JSON.stringify(result.failure)).not.toContain('PRIVATE_CONTENT');
});

it('opens legacy header history at every undo position without losing unrelated content', () => {
  const content = createQuickEditAdvancedContent();
  const first = { ...content, windowHeader: { kind: 'browser', title: 'Old tab' } };
  const renamed = { ...content, windowHeader: { kind: 'browser', title: 'Renamed tab' } };
  const changed = {
    ...renamed,
    audio: { ...content.audio, original: { ...content.audio.original, volume: 0.5 } },
  };
  const withoutHeader = { ...content, audio: changed.audio };
  const history = [
    { id: 'header-add', at: 1, target: 'advancedContent', before: content, after: first },
    { id: 'header-title', at: 2, target: 'advancedContent', before: first, after: renamed },
    { id: 'volume', at: 3, target: 'advancedContent', before: renamed, after: changed },
    {
      id: 'header-remove',
      at: 4,
      target: 'advancedContent',
      before: changed,
      after: withoutHeader,
    },
  ];
  for (let cursor = 0; cursor <= history.length; cursor++) {
    const raw = { ...workspace(), cursor, history };
    const original = structuredClone(raw);
    const result = inspectVideoWorkspace(raw);
    expect(result.failure).toBeNull();
    expect(result.workspace?.history.map((op) => op.id)).toEqual(['volume']);
    expect(result.workspace?.cursor).toBe(cursor >= 3 ? 1 : 0);
    if (!result.workspace) throw new Error('Legacy workspace admission failed');
    expect(result.document).toEqual(
      replayReviewHistory(
        result.workspace.history,
        result.workspace.cursor,
        result.workspace.source,
        reviewAdvancedContentBaseline(result.workspace.advanced)
      )
    );
    expect(inspectVideoWorkspace(result.workspace).workspace).toEqual(result.workspace);
    expect(raw).toEqual(original);
  }
});

it('does not hide corrupt before-values or unrelated no-ops behind a discarded header', () => {
  const content = createQuickEditAdvancedContent();
  const legacy = { ...content, windowHeader: { kind: 'browser', title: 'Old' } };
  const operation = {
    id: 'header',
    at: 1,
    target: 'advancedContent',
    before: content,
    after: legacy,
  };
  const stale = {
    ...content,
    audio: { ...content.audio, original: { ...content.audio.original, volume: 0.3 } },
  };
  expect(
    inspectVideoWorkspace({
      ...workspace(),
      history: [
        { ...operation, before: stale, after: { ...stale, windowHeader: legacy.windowHeader } },
      ],
    }).failure
  ).toMatchObject({ check: 'history-replay', reason: 'before-mismatch', operationIndex: 0 });
  expect(
    inspectVideoWorkspace({ ...workspace(), history: [{ ...operation, before: legacy }] }).failure
  ).toMatchObject({ check: 'history-replay', reason: 'no-change' });
  expect(
    inspectVideoWorkspace({
      ...workspace(),
      history: [operation, { ...operation, id: 'corrupt', before: content, after: content }],
    }).failure
  ).toMatchObject({ check: 'history-replay', reason: 'no-change', operationIndex: 1 });
  expect(
    inspectVideoWorkspace({ ...workspace(), history: [operation, operation] }).failure
  ).toMatchObject({ reason: 'duplicate-operation', operationIndex: 1 });
  expect(
    inspectVideoWorkspace({
      ...workspace(),
      history: [
        {
          ...operation,
          after: { ...legacy, windowHeader: { ...legacy.windowHeader, theme: 'invalid' } },
        },
      ],
    }).failure
  ).toMatchObject({ check: 'history-operation', operationIndex: 0 });
});

it('retains current header operations and the baseline header when reopening', () => {
  const content = createQuickEditAdvancedContent();
  const after = { ...content, windowHeader: { ...DEFAULT_WINDOW_HEADER, title: 'Current' } };
  const operation = { id: 'modern', at: 1, target: 'advancedContent', before: content, after };
  const parsed = inspectVideoWorkspace({ ...workspace(), cursor: 1, history: [operation] });
  expect(parsed.failure).toBeNull();
  expect(parsed.workspace?.history).toEqual([operation]);
  expect(parsed.workspace?.cursor).toBe(1);
  const baseline = inspectVideoWorkspace({
    ...workspace(),
    advanced: { ...workspace().advanced, windowHeader: after.windowHeader },
  });
  expect(baseline.workspace?.advanced.windowHeader).toEqual(after.windowHeader);
});

it.each([0, 1, 2, 3])(
  'reopens mixed compact and full content history at cursor %s without writes',
  (cursor) => {
    const before = createQuickEditAdvancedContent();
    const first = { ...before, actionsEnabled: false };
    const muted = { ...first, audio: { ...first.audio, original: { muted: true, volume: 0.5 } } };
    const final = { ...muted, actionsEnabled: true };
    const raw = {
      ...workspace(),
      cursor,
      history: [
        { id: 'content', at: 1, target: 'advancedContent', before, after: first },
        {
          id: 'gain',
          at: 2,
          target: 'sourceAudio',
          before: { muted: false, volume: 1 },
          after: { muted: true, volume: 0.5 },
        },
        { id: 'compound', at: 3, target: 'advancedContent', before: muted, after: final },
      ],
    };
    const original = structuredClone(raw);
    const admitted = inspectVideoWorkspace(raw);
    expect(admitted.failure).toBeNull();
    expect(admitted.document?.advancedContent).toEqual([before, first, muted, final][cursor]);
    expect(admitted.workspace?.history).toHaveLength(3);
    expect(inspectVideoWorkspace(admitted.workspace).workspace).toEqual(admitted.workspace);
    expect(raw).toEqual(original);
  }
);
it('rejects stale compact gain in unapplied redo and leaves raw history intact', () => {
  const raw = {
    ...workspace(),
    history: [
      {
        id: 'gain',
        at: 1,
        target: 'sourceAudio',
        before: { muted: true, volume: 1 },
        after: { muted: false, volume: 0.5 },
      },
    ],
  };
  const original = structuredClone(raw);
  expect(inspectVideoWorkspace(raw)).toMatchObject({
    workspace: null,
    document: null,
    failure: {
      check: 'history-replay',
      reason: 'before-mismatch',
      operationIndex: 0,
      target: 'sourceAudio',
    },
  });
  expect(raw).toEqual(original);
});

it.each([3, 4])(
  'admits permanent project metadata in logical format %s without modifying input',
  (formatVersion) => {
    const raw = {
      ...workspace(),
      formatVersion,
      ...(formatVersion === 4
        ? {
            baseline: {
              annotations: [],
              edits: [],
              canvasComments: [],
              advancedContent: createQuickEditAdvancedContent(),
            },
          }
        : {}),
      project: {
        name: 'Retained project',
        lifecycle: { storageClass: 'library', savedAt: 1, updatedAt: 2, trashedAt: 3 },
      },
    };
    const before = structuredClone(raw);
    const admitted = inspectVideoWorkspace(raw);
    expect(admitted.failure).toBeNull();
    expect(admitted.workspace?.project).toEqual(raw.project);
    expect(inspectVideoWorkspace(admitted.workspace).workspace).toEqual(admitted.workspace);
    expect(raw).toEqual(before);
  }
);

it.each([
  undefined,
  null,
  { name: '', lifecycle: { storageClass: 'library', savedAt: 1, updatedAt: 1 } },
  { name: 'x'.repeat(257), lifecycle: { storageClass: 'library', savedAt: 1, updatedAt: 1 } },
  { name: 'Project', lifecycle: { storageClass: 'temporary', savedAt: null, updatedAt: 1 } },
  { name: 'Project', lifecycle: { storageClass: 'library', savedAt: null, updatedAt: 1 } },
  { name: 'Project', lifecycle: { storageClass: 'library', savedAt: -1, updatedAt: 1 } },
  { name: 'Project', lifecycle: { storageClass: 'library', savedAt: 1, updatedAt: -1 } },
  {
    name: 'Project',
    lifecycle: { storageClass: 'library', savedAt: 1, updatedAt: 1, trashedAt: -1 },
  },
])('rejects invalid project metadata without exposing values in diagnostics', (project) => {
  const raw = { ...workspace(), formatVersion: 3, project };
  const before = structuredClone(raw);
  const result = inspectVideoWorkspace(raw);
  expect(result.workspace).toBeNull();
  expect(result.failure).toMatchObject({ check: 'project-metadata', reason: 'invalid' });
  expect(JSON.stringify(result.failure)).not.toContain('Project');
  expect(raw).toEqual(before);
});

it.each([1, 2, 5])(
  'refuses project metadata in legacy or future logical format %s',
  (formatVersion) => {
    expect(
      inspectVideoWorkspace({
        ...workspace(),
        formatVersion,
        project: {
          name: 'Project',
          lifecycle: { storageClass: 'library', savedAt: 1, updatedAt: 1 },
        },
      }).workspace
    ).toBeNull();
  }
);
