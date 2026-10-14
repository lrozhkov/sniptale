import { reviewAdvancedContentBaseline } from '../../../features/video/review/document';
import { expect, it } from 'vitest';
import { createQuickEditAdvancedState } from '../../../features/video/review/advanced/defaults';
import type { VideoWorkspace } from './contracts';
import { parseVideoWorkspace } from './parser';
import {
  materializeWorkspaceStorage,
  workspaceStorageHead,
  workspaceStorageRows,
} from './storage-format';

const workspace: VideoWorkspace = {
  aggregateId: 'review',
  formatVersion: 1,
  source: { duration: 12, width: 640, height: 360, mimeType: 'video/webm', size: 15 },
  sourceAssetId: 'bytes',
  revision: 1,
  cursor: 1,
  createdAt: 1,
  updatedAt: 1,
  advanced: createQuickEditAdvancedState(),
  history: [
    {
      id: 'annotation',
      at: 1,
      target: 'annotation',
      before: null,
      after: { id: 'text', text: 'Retained text', anchor: { kind: 'point', time: 2 } },
    },
  ],
};

it('materializes the complete retained logical history from unordered physical rows', () => {
  const head = workspaceStorageHead(workspace, ['indexed:v1']);
  expect(head).not.toHaveProperty('history');
  expect(head).not.toHaveProperty('advanced');
  const assembled = materializeWorkspaceStorage(head, workspaceStorageRows(workspace).reverse());
  expect(parseVideoWorkspace(assembled)).toEqual(workspace);
});

it.each([
  { name: 'gap', rows: workspaceStorageRows(workspace).slice(0, 1) },
  {
    name: 'duplicate',
    rows: [workspaceStorageRows(workspace)[0], workspaceStorageRows(workspace)[0]],
  },
  {
    name: 'wrong identity',
    rows: workspaceStorageRows(workspace).map((row) => ({ ...row, aggregateId: 'other' })),
  },
  {
    name: 'extra operation',
    rows: [
      ...workspaceStorageRows(workspace),
      { aggregateId: 'review', ordinal: 2, operation: null },
    ],
  },
  {
    name: 'wrong baseline role',
    rows: [
      { aggregateId: 'review', ordinal: 0, operation: workspace.history[0] },
      workspaceStorageRows(workspace)[1],
    ],
  },
])('refuses $name without converting the evidence into empty history', ({ rows }) => {
  const head = workspaceStorageHead(workspace, []);
  const before = structuredClone({ head, rows });
  expect(parseVideoWorkspace(materializeWorkspaceStorage(head, rows))).toBeNull();
  expect({ head, rows }).toEqual(before);
});

it('retains legacy read admission and refuses future or orphan evidence', () => {
  expect(materializeWorkspaceStorage(workspace, [])).toBe(workspace);
  expect(
    parseVideoWorkspace(materializeWorkspaceStorage(workspace, workspaceStorageRows(workspace)))
  ).toBeNull();
  expect(
    parseVideoWorkspace(materializeWorkspaceStorage(undefined, workspaceStorageRows(workspace)))
  ).toBeNull();
  const future = { ...workspaceStorageHead(workspace, []), formatVersion: 3 };
  expect(materializeWorkspaceStorage(future, [])).toBe(future);
  expect(
    parseVideoWorkspace(materializeWorkspaceStorage(future, workspaceStorageRows(workspace)))
  ).toBeNull();
});

it('leaves invalid retained redo to the full logical admission owner', () => {
  const head = { ...workspaceStorageHead(workspace, []), cursor: 0 };
  const rows = [
    workspaceStorageRows(workspace)[0],
    { aggregateId: 'review', ordinal: 1, operation: { target: 'annotation' } },
  ];
  expect(parseVideoWorkspace(materializeWorkspaceStorage(head, rows))).toBeNull();
});

it.each([3, 4] as const)(
  'roundtrips logical project format %s through its own physical head without changing rows',
  (formatVersion) => {
    const input: VideoWorkspace = {
      ...workspace,
      formatVersion,
      ...(formatVersion === 4
        ? {
            baseline: {
              annotations: [],
              edits: [],
              canvasComments: [],
              advancedContent: reviewAdvancedContentBaseline(workspace.advanced),
            },
          }
        : {}),
      project: {
        name: 'Saved edit',
        lifecycle: { storageClass: 'library', savedAt: 1, updatedAt: 2, trashedAt: 3 },
      },
    };
    const head = workspaceStorageHead(input, ['indexed:v1']);
    expect(head.formatVersion).toBe(formatVersion + 1);
    expect(head.project).toEqual(input.project);
    const rows = workspaceStorageRows(input);
    const before = structuredClone({ head, rows });
    expect(parseVideoWorkspace(materializeWorkspaceStorage(head, rows))).toEqual(input);
    expect({ head, rows }).toEqual(before);
    expect(
      parseVideoWorkspace(materializeWorkspaceStorage({ ...head, formatVersion: 6 }, rows))
    ).toBeNull();
    expect(
      parseVideoWorkspace(materializeWorkspaceStorage({ ...head, project: undefined }, rows))
    ).toBeNull();
  }
);

it.each([2, 4] as const)(
  'refuses mixed physical format %s evidence even when its inline document looks valid',
  (formatVersion) => {
    const project = {
      name: 'Project',
      lifecycle: { storageClass: 'library' as const, savedAt: 1, updatedAt: 1 },
    };
    const mixed = {
      ...workspaceStorageHead(workspace, []),
      formatVersion,
      ...(formatVersion === 4 ? { project } : {}),
      history: workspace.history,
      advanced: workspace.advanced,
      baseline: {
        annotations: [],
        edits: [],
        canvasComments: [],
        advancedContent: reviewAdvancedContentBaseline(workspace.advanced),
      },
    };
    const before = structuredClone(mixed);
    expect(
      parseVideoWorkspace(materializeWorkspaceStorage(mixed, workspaceStorageRows(workspace)))
    ).toBeNull();
    expect(mixed).toEqual(before);
  }
);
