import { beforeEach, expect, it, vi } from 'vitest';
import { sha256 } from '@noble/hashes/sha2.js';
import { createGuideProject, createGuideStep } from '../../../features/scenario/project/factories';
import {
  DEFAULT_BROWSER_FRAME_STATE,
  DEFAULT_EDITOR_FRAME_SETTINGS,
} from '../../../features/editor/document/constants';
import { createScenarioProjectEntry } from '../scenario/projects/entry';
import { createPersistedEditorDocumentFixture } from '../document-assets/test-support';
import type { AssetRef } from '../assets';
import {
  collectPreparedScenarioReplicaRefs,
  hydratePreparedScenarioReplicaRoot,
  parsePreparedScenarioReplicaRoot,
  type PreparedScenarioReplicaRoot,
} from './prepared-scenario';
import { MAX_NATIVE_SCENARIO_HISTORY_BYTES } from './scenario-snapshot';

const io = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('../assets', async (original) => ({
  ...(await original<typeof import('../assets')>()),
  readAssetFile: io.read,
}));
beforeEach(() => vi.resetAllMocks());

function checksum(bytes: Uint8Array): string {
  return Array.from(sha256(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function fixture() {
  const files = new Map<string, Blob>();
  function resource(assetId: string, text: string, mimeType: string): AssetRef {
    const body = new Blob([text], { type: mimeType });
    files.set(assetId, body);
    return {
      assetId,
      createdAt: 1,
      location: { kind: 'opfs', objectKey: `objects/${assetId}` },
      mimeType,
      size: body.size,
      sha256: checksum(new TextEncoder().encode(text)),
    };
  }
  const project = createGuideProject('Journal Guide', 'guide', 1);
  project.items = [createGuideStep('Retained step', 'step')];
  const entry = createScenarioProjectEntry({ project, existing: undefined, updatedAt: 100 });
  entry.workspaceRevision = 2;
  const history = [
    { revision: 0, savedAt: 50, project: { ...structuredClone(project), updatedAt: 50 } },
  ];
  const image = resource('image', 'image body', 'image/png');
  const thumbnail = resource('thumbnail', 'thumbnail body', 'image/png');
  const preview = resource('preview', 'preview body', 'image/webp');
  const html = resource('html', '<!doctype html><title>Guide</title>', 'text/html;charset=utf-8');
  const document = createPersistedEditorDocumentFixture(
    {
      version: 2,
      sourceImageData: 'data:image/png;base64,source',
      sourceName: 'step.png',
      sourceWidth: 320,
      sourceHeight: 180,
      canvasWidth: 320,
      canvasHeight: 180,
      sourceLeft: 0,
      sourceTop: 0,
      sourceDisplayWidth: 320,
      sourceDisplayHeight: 180,
      frame: DEFAULT_EDITOR_FRAME_SETTINGS,
      browserFrame: DEFAULT_BROWSER_FRAME_STATE,
      canvasJson: '{"objects":[]}',
    },
    image.assetId
  );
  const root: PreparedScenarioReplicaRoot = {
    entry,
    historyRef: resource('history', JSON.stringify(history), 'application/json'),
    assets: [
      {
        entry: {
          id: 'child',
          projectId: project.id,
          assetId: image.assetId,
          galleryAssetId: null,
          mimeType: image.mimeType,
          size: image.size,
          width: 320,
          height: 180,
          createdAt: 1,
        },
        ref: image,
      },
    ],
    exports: [
      {
        id: 'export',
        projectId: project.id,
        format: 'html',
        filename: 'guide.html',
        createdAt: 90,
        size: html.size,
        html: { mode: 'guide', assetId: html.assetId },
      },
    ],
    exportRefs: [html],
    stepDocuments: [
      {
        entry: { stepId: 'step', projectId: project.id, document, createdAt: 1, updatedAt: 90 },
        refs: [image],
      },
    ],
    thumbnails: [
      {
        entry: {
          assetId: `scenario:${project.id}`,
          createdAt: 1,
          updatedAt: 90,
          width: 32,
          height: 18,
        },
        ref: thumbnail,
      },
      {
        entry: {
          assetId: 'scenario-export:export',
          createdAt: 1,
          updatedAt: 90,
          width: 32,
          height: 18,
        },
        ref: thumbnail,
      },
    ],
    presentation: {
      entry: {
        aggregateId: project.id,
        aggregateKind: 'scenario',
        presentationRevision: 2,
        updatedAt: 90,
      },
      thumbnailRef: thumbnail,
      previewRef: preview,
    },
  };
  io.read.mockImplementation(async (source: AssetRef, filename: string) => {
    const body = files.get(source.assetId);
    if (!body) throw new Error('Missing physical resource');
    return new File([body], filename, { type: body.type });
  });
  return { root, files, history, resource };
}

it('hydrates a claimed Guide with history, documents, HTML and presentations without changing identities', async () => {
  const { root, history } = fixture();
  const admitted = parsePreparedScenarioReplicaRoot(root);
  const claims = collectPreparedScenarioReplicaRefs(admitted);
  expect(claims.map((source) => source.assetId)).toEqual([
    'image',
    'html',
    'thumbnail',
    'history',
    'preview',
  ]);
  expect(collectPreparedScenarioReplicaRefs(admitted)).toEqual(claims);
  expect(io.read).not.toHaveBeenCalled();
  const hydrated = await hydratePreparedScenarioReplicaRoot(admitted);
  expect(hydrated.entry).toEqual({ ...root.entry, history });
  expect(hydrated.assets).toEqual(root.assets);
  expect(hydrated.stepDocuments).toEqual(root.stepDocuments);
  expect(hydrated.exports).toEqual(root.exports);
  expect(hydrated.exportRefs).toEqual(root.exportRefs);
  expect(hydrated.thumbnail?.assetId).toBe('scenario:guide');
  expect(hydrated.exportThumbnails?.map((item) => item.assetId)).toEqual([
    'scenario-export:export',
  ]);
  expect(await hydrated.thumbnail?.blob.text()).toBe('thumbnail body');
  expect(await hydrated.presentation?.thumbnailBlob.text()).toBe('thumbnail body');
  expect(await hydrated.presentation?.previewBlob?.text()).toBe('preview body');
  expect(hydrated.presentation?.presentationRevision).toBe(root.entry.workspaceRevision);
  expect(io.read.mock.calls.map(([source]) => source.assetId)).not.toContain('image');
  expect(io.read.mock.calls.map(([source]) => source.assetId)).not.toContain('html');
  expect(root.entry).not.toHaveProperty('history');
});

it('admits an original-only Guide without optional detached metadata or physical reads', async () => {
  const { root } = fixture();
  delete root.historyRef;
  delete root.presentation;
  root.assets = [];
  root.exports = [];
  root.exportRefs = [];
  root.stepDocuments = [];
  root.thumbnails = [];
  expect(collectPreparedScenarioReplicaRefs(root)).toEqual([]);
  expect(await hydratePreparedScenarioReplicaRoot(root)).toEqual({
    entry: root.entry,
    assets: [],
    exports: [],
    exportRefs: [],
    stepDocuments: [],
    exportThumbnails: [],
  });
  expect(io.read).not.toHaveBeenCalled();
});

it('hydrates a thumbnail-only presentation without manufacturing a preview', async () => {
  const { root } = fixture();
  delete root.presentation!.previewRef;
  const hydrated = await hydratePreparedScenarioReplicaRoot(root);
  expect(hydrated.presentation).not.toHaveProperty('previewBlob');
  expect(hydrated.presentation?.aggregateId).toBe(root.entry.id);
});

it('retains legacy export metadata without inventing a body claim or project thumbnail', async () => {
  const { root } = fixture();
  delete root.historyRef;
  delete root.presentation;
  const { html: _html, ...legacy } = root.exports[0]!;
  root.exports = [legacy];
  root.exportRefs = [];
  root.thumbnails = root.thumbnails.filter(
    (item) => item.entry.assetId === 'scenario-export:export'
  );
  const claims = collectPreparedScenarioReplicaRefs(root);
  expect(claims.map((source) => source.assetId)).toEqual(['image', 'thumbnail']);
  const hydrated = await hydratePreparedScenarioReplicaRoot(root);
  expect(hydrated.exports).toEqual([legacy]);
  expect(hydrated).not.toHaveProperty('thumbnail');
  expect(hydrated).not.toHaveProperty('presentation');
  expect(hydrated.exportThumbnails).toHaveLength(1);
});

const rejectedBindings: [string, (root: PreparedScenarioReplicaRoot) => unknown][] = [
  ['non-object journal payload', () => null],
  ['invalid native project', (root) => ({ ...root, entry: { ...root.entry, project: null } })],
  [
    'inline history bypassing its claim',
    (root) => ({
      ...root,
      entry: {
        ...root.entry,
        history: [{ revision: 0, savedAt: 50, project: { ...root.entry.project, updatedAt: 50 } }],
      },
    }),
  ],
  ['unclaimed inline bytes', (root) => ({ ...root, detached: new Blob(['unclaimed']) })],
  ['missing resource lists', (root) => ({ ...root, assets: undefined })],
  ['malformed asset binding', (root) => ({ ...root, assets: [null] })],
  ['missing physical ref', (root) => ({ ...root, assets: [{ entry: root.assets[0]!.entry }] })],
  [
    'wrong resource identity',
    (root) => ({ ...root, assets: [{ ...root.assets[0], ref: root.exportRefs[0] }] }),
  ],
  [
    'wrong resource MIME',
    (root) => ({
      ...root,
      assets: [{ ...root.assets[0], ref: { ...root.assets[0]!.ref, mimeType: 'image/webp' } }],
    }),
  ],
  [
    'wrong resource size',
    (root) => ({
      ...root,
      assets: [{ ...root.assets[0], entry: { ...root.assets[0]!.entry, size: 999 } }],
    }),
  ],
  [
    'cross-root child',
    (root) => ({
      ...root,
      assets: [{ ...root.assets[0], entry: { ...root.assets[0]!.entry, projectId: 'foreign' } }],
    }),
  ],
  ['duplicate child identity', (root) => ({ ...root, assets: [...root.assets, ...root.assets] })],
  [
    'missing document resource',
    (root) => ({ ...root, stepDocuments: [{ ...root.stepDocuments[0], refs: [] }] }),
  ],
  [
    'wrong document resource',
    (root) => ({ ...root, stepDocuments: [{ ...root.stepDocuments[0], refs: root.exportRefs }] }),
  ],
  [
    'duplicate document resource',
    (root) => ({
      ...root,
      stepDocuments: [
        {
          ...root.stepDocuments[0],
          refs: [...root.stepDocuments[0]!.refs, ...root.stepDocuments[0]!.refs],
        },
      ],
    }),
  ],
  [
    'damaged editor document',
    (root) => ({
      ...root,
      stepDocuments: [
        {
          ...root.stepDocuments[0],
          entry: { ...root.stepDocuments[0]!.entry, document: { version: 3 } },
        },
      ],
    }),
  ],
  [
    'invalid HTML export',
    (root) => ({
      ...root,
      exports: [{ ...root.exports[0], html: { mode: 'unknown', assetId: 'html' } }],
    }),
  ],
  ['missing HTML resource', (root) => ({ ...root, exportRefs: [] })],
  [
    'duplicate HTML claim',
    (root) => ({ ...root, exportRefs: [...root.exportRefs, ...root.exportRefs] }),
  ],
  [
    'wrong HTML MIME',
    (root) => ({
      ...root,
      exportRefs: root.exportRefs.map((source) => ({ ...source, mimeType: 'image/png' })),
    }),
  ],
  [
    'wrong HTML size',
    (root) => ({
      ...root,
      exportRefs: root.exportRefs.map((source) => ({ ...source, size: source.size + 1 })),
    }),
  ],
  [
    'damaged thumbnail metadata',
    (root) => ({
      ...root,
      thumbnails: [
        { ...root.thumbnails[0], entry: { ...root.thumbnails[0]!.entry, width: 'invalid' } },
      ],
    }),
  ],
  [
    'foreign thumbnail owner',
    (root) => ({
      ...root,
      thumbnails: [
        {
          ...root.thumbnails[0],
          entry: { ...root.thumbnails[0]!.entry, assetId: 'scenario:foreign' },
        },
      ],
    }),
  ],
  [
    'non-image thumbnail',
    (root) => ({ ...root, thumbnails: [{ ...root.thumbnails[0], ref: root.exportRefs[0] }] }),
  ],
  [
    'future presentation revision',
    (root) => ({
      ...root,
      presentation: {
        ...root.presentation,
        entry: { ...root.presentation!.entry, presentationRevision: 3 },
      },
    }),
  ],
  [
    'foreign presentation owner',
    (root) => ({
      ...root,
      presentation: {
        ...root.presentation,
        entry: { ...root.presentation!.entry, aggregateId: 'foreign' },
      },
    }),
  ],
  [
    'wrong presentation kind',
    (root) => ({
      ...root,
      presentation: {
        ...root.presentation,
        entry: { ...root.presentation!.entry, aggregateKind: 'image' },
      },
    }),
  ],
  [
    'wrong history MIME',
    (root) => ({ ...root, historyRef: { ...root.historyRef, mimeType: 'text/plain' } }),
  ],
  [
    'history without checksum',
    (root) => ({ ...root, historyRef: { ...root.historyRef, sha256: null } }),
  ],
  [
    'oversized retained history',
    (root) => ({
      ...root,
      historyRef: { ...root.historyRef, size: MAX_NATIVE_SCENARIO_HISTORY_BYTES + 1 },
    }),
  ],
];

it.each(rejectedBindings)(
  'refuses %s before journal claims or physical reads',
  (_label, corrupt) => {
    const { root } = fixture();
    expect(() => parsePreparedScenarioReplicaRoot(corrupt(root))).toThrow(
      'Invalid prepared Scenario replica'
    );
    expect(io.read).not.toHaveBeenCalled();
  }
);

it('refuses contradictory immutable refs shared by child and document before claiming bytes', () => {
  const { root } = fixture();
  root.stepDocuments[0]!.refs[0] = { ...root.assets[0]!.ref, createdAt: 2 };
  const admitted = parsePreparedScenarioReplicaRoot(root);
  expect(() => collectPreparedScenarioReplicaRefs(admitted)).toThrow(
    'Invalid prepared Scenario replica'
  );
  expect(io.read).not.toHaveBeenCalled();
});

it.each(['missing', 'size', 'MIME', 'checksum', 'damaged JSON', 'foreign history'] as const)(
  'refuses %s history bytes before returning a native publication root',
  async (failure) => {
    const { root, files, resource } = fixture();
    const source = root.historyRef!;
    if (failure === 'missing') files.delete(source.assetId);
    if (failure === 'size')
      files.set(source.assetId, new Blob(['short'], { type: source.mimeType }));
    if (failure === 'MIME')
      files.set(
        source.assetId,
        new Blob([await files.get(source.assetId)!.arrayBuffer()], { type: 'text/plain' })
      );
    if (failure === 'checksum') root.historyRef = { ...source, sha256: '0'.repeat(64) };
    if (failure === 'damaged JSON')
      root.historyRef = resource('history', '{broken', 'application/json');
    if (failure === 'foreign history')
      root.historyRef = resource(
        'history',
        JSON.stringify([
          { revision: 0, savedAt: 50, project: createGuideProject('Foreign', 'foreign', 1) },
        ]),
        'application/json'
      );
    expect(() => collectPreparedScenarioReplicaRefs(root)).not.toThrow();
    await expect(hydratePreparedScenarioReplicaRoot(root)).rejects.toThrow();
    expect(root.entry).not.toHaveProperty('history');
  }
);
