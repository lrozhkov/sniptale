import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { expect, it, vi, type Mock } from 'vitest';
import {
  sha256EffectV1Bytes,
  parseEffectV1Source,
  resolveEffectV1ControlDefault,
} from '@sniptale/runtime-contracts/effect-v1';
import { createBuiltinEffectResources } from '../../composition/persistence/effect-bundles/builtin';
import type { PreparedProjectAsset } from '../../composition/persistence/projects';
import type { VideoWorkspaceSnapshot } from '../../composition/persistence/review-workspaces/contracts';
import {
  parseVideoWorkspace,
  parseVideoWorkspaceDraft,
} from '../../composition/persistence/review-workspaces/parser';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
import type { EffectBundleCatalogEntry } from '../../features/video/project/effect-bundle/catalog';
import { readVerifiedCatalogDocument } from '../../features/video/project/effect-instance/catalog-reader';
import { createVideoReviewSession } from './session';
import { applyReviewAnnotationCatalogDocument } from './annotation-acquisition';

const index = new TextEncoder().encode(
  execFileSync(
    process.execPath,
    [
      '--import',
      'tsx',
      '--input-type=module',
      '-e',
      [
        "import {buildVideoEffectIndex} from './apps/extension/build/video-effects.ts';",
        'console.log(JSON.stringify(await buildVideoEffectIndex(process.argv[1])));',
      ].join(' '),
      'apps/extension/public/video-effects',
    ],
    { encoding: 'utf8' }
  )
);
const builtins = createBuiltinEffectResources(async (path) =>
  path === 'index.json'
    ? index
    : Uint8Array.from(readFileSync(`apps/extension/public/video-effects/${path}`))
);

function setup() {
  let stored: VideoWorkspaceSnapshot = {
    workspace: {
      aggregateId: 'recording:r',
      sourceAssetId: 'source',
      formatVersion: 1,
      source: { duration: 10, width: 1920, height: 1080, mimeType: 'video/webm', size: 1 },
      revision: 1,
      cursor: 0,
      history: [],
      advanced: createQuickEditAdvancedState(),
      createdAt: 1,
      updatedAt: 1,
    },
    draft: null,
  };
  const read = vi.fn(async () => structuredClone(stored));
  const save = vi.fn(
    async (
      args: Parameters<
        NonNullable<Parameters<typeof createVideoReviewSession>[1]>['saveVideoWorkspaceSnapshot']
      >[0]
    ) => {
      const workspace = parseVideoWorkspace(args.workspace);
      if (!workspace) throw new Error('Invalid snapshot fixture.');
      const draft =
        args.draft === null
          ? null
          : parseVideoWorkspaceDraft(args.draft, workspace.source.duration);
      if (args.draft !== null && !draft) throw new Error('Invalid draft fixture.');
      stored = { workspace: { ...workspace, revision: stored.workspace.revision + 1 }, draft };
      return structuredClone(stored);
    }
  );
  const session = createVideoReviewSession(stored, {
    readVideoWorkspace: read,
    moveVideoWorkspaceHistory: read,
    saveVideoWorkspaceAdvanced: read,
    saveVideoWorkspaceDraft: read,
    commitVideoWorkspace: read,
    saveVideoWorkspaceSnapshot: save,
  });
  session.setAutosaveEnabled(false);
  const handles: PreparedProjectAsset[] = [];
  const releases: Mock<() => Promise<void>>[] = [];
  const prepare = vi.fn(
    async (
      blob: Blob,
      mimeType: string,
      _filename?: string,
      id?: string
    ): Promise<PreparedProjectAsset> => {
      const release = vi.fn(async () => undefined);
      releases.push(release);
      const prepared: PreparedProjectAsset = {
        id: id!,
        ref: {
          assetId: `physical:${id}`,
          mimeType,
          size: blob.size,
          createdAt: 1,
          sha256: null,
          location: { kind: 'opfs', objectKey: `object:${id}` },
        },
        protect: vi.fn(async () => undefined),
        retainForSession: vi.fn(async () => release),
        readForSession: vi.fn(async () => blob),
        cancel: vi.fn(async () => undefined),
        publish: vi.fn(async () => undefined),
        discard: vi.fn(async () => undefined),
      };
      handles.push(prepared);
      return prepared;
    }
  );
  const deps = {
    readVideoWorkspace: read,
    readVerifiedCatalogDocument,
    prepareProjectAsset: prepare,
  };
  const args = {
    session,
    start: 2,
    locale: 'ru',
    plane: { width: 1920, height: 1080 },
    signal: new AbortController().signal,
  };
  return { session, handles, releases, read, save, prepare, deps, args };
}

async function importedSvg(): Promise<EffectBundleCatalogEntry> {
  const source = readFileSync(
    'packages/runtime-contracts/src/effect-v1/fixtures/valid/neutral-runtime-conformance.sniptale-effect.json',
    'utf8'
  );
  const document = parseEffectV1Source(source).document!;
  const declaration = document.assets[0]!;
  const bytes = Uint8Array.from(
    readFileSync('tooling/test/e2e/fixtures/effect-v1/assets/neutral-mark.svg')
  );
  const sha256 = await sha256EffectV1Bytes(new TextEncoder().encode(source));
  return {
    packId: 'imported',
    source: 'bundle-zip',
    sourceSha256: sha256,
    version: '1.0.0',
    label: { en: 'Imported', ru: 'Импорт' },
    description: { en: '', ru: '' },
    createdAt: 1,
    updatedAt: 1,
    enabled: true,
    retainedByteLength: new TextEncoder().encode(source).byteLength + bytes.byteLength,
    assets: [
      {
        kind: 'svg',
        mimeType: declaration.mimeType,
        sha256: declaration.sha256!,
        byteLength: bytes.byteLength,
        blob: new Blob([bytes], { type: declaration.mimeType }),
      },
    ],
    documents: [
      {
        id: document.id,
        kind: 'standalone',
        schemaVersion: 'sniptale.effect.v1',
        sha256,
        source,
        assets: [{ id: declaration.id, sha256: declaration.sha256! }],
      },
    ],
  };
}

it.each(['lower-third', 'title', 'chapters', 'callout', 'frame', 'corners'])(
  'applies the actual lazy %s builtin with declared controls, fixed anchors and one local history operation',
  async (name) => {
    const fixture = setup();
    const catalog = await builtins.load();
    const choice = catalog.documents.find((entry) => entry.id === `sniptale-${name}`)!;
    const id = await applyReviewAnnotationCatalogDocument(
      { ...fixture.args, catalog, documentId: choice.id },
      fixture.deps
    );
    const snapshot = fixture.session.getSnapshot();
    const instance = snapshot.document.advancedContent.annotationEffects!.instances[0]!;
    const retained = snapshot.snapshot.workspace.effectSnapshots![0]!;
    const document = parseEffectV1Source(retained.source).document!;
    expect(instance).toMatchObject({
      id,
      start: 2,
      end: 6,
      order: 0,
      enabled: true,
      attachment: 'content',
    });
    expect(retained.id).toBe(`effect:${choice.sha256}`);
    expect(snapshot.snapshot.workspace.history).toHaveLength(1);
    expect(snapshot.snapshot.workspace.revision).toBe(1);
    expect(fixture.save).not.toHaveBeenCalled();
    expect(fixture.prepare).not.toHaveBeenCalled();
    expect(Object.keys(instance.anchors ?? {})).toEqual(
      (document.objectLayout?.handles ?? []).map((handle) => handle.id)
    );
    const bound = new Set(
      document.objectLayout?.handles?.flatMap((handle) => [handle.xControl, handle.yControl]) ?? []
    );
    for (const control of document.controls)
      if (!bound.has(control.id) && control.kind === 'text')
        expect(instance.controls[control.id]).toBe(resolveEffectV1ControlDefault(control, 'ru'));
    await fixture.session.dispose();
  }
);

it('clamps click duration, honors a drawn range and rejects empty ranges', async () => {
  const fixture = setup();
  const catalog = await builtins.load();
  const documentId = 'sniptale-frame';
  await applyReviewAnnotationCatalogDocument(
    { ...fixture.args, catalog, documentId, start: 9 },
    fixture.deps
  );
  await applyReviewAnnotationCatalogDocument(
    { ...fixture.args, catalog, documentId, start: 1, end: 8 },
    fixture.deps
  );
  expect(
    fixture.session
      .getSnapshot()
      .document.advancedContent.annotationEffects!.instances.map(({ start, end }) => [start, end])
  ).toEqual([
    [9, 10],
    [1, 8],
  ]);
  await expect(
    applyReviewAnnotationCatalogDocument(
      { ...fixture.args, catalog, documentId, start: 10 },
      fixture.deps
    )
  ).rejects.toMatchObject({ code: 'invalid-range' });
  expect(fixture.session.getSnapshot().snapshot.workspace.history).toHaveLength(2);
  await fixture.session.dispose();
});

it('copies SVG privately, uses full-scene geometry and survives catalog removal', async () => {
  const fixture = setup();
  const catalog = await importedSvg();
  const documentId = catalog.documents[0]!.id;
  await applyReviewAnnotationCatalogDocument(
    { ...fixture.args, catalog, documentId },
    fixture.deps
  );
  const first = fixture.session.getSnapshot().snapshot.workspace.effectSnapshots![0]!;
  const privateBytes = await fixture.session.readAnnotationResource(
    first.assets[0]!.assetId,
    fixture.args.signal
  );
  expect(privateBytes?.type).toBe('image/svg+xml');
  expect(await privateBytes?.text()).toBe(await catalog.assets[0]!.blob.text());
  expect(fixture.handles[0]!.readForSession).toHaveBeenCalledOnce();
  expect(fixture.handles[0]!.publish).not.toHaveBeenCalled();
  expect(fixture.save).not.toHaveBeenCalled();
  expect(fixture.prepare).toHaveBeenCalledOnce();
  expect(fixture.prepare.mock.calls[0]?.[3]).toBe(
    first.assets[0]!.assetId.slice('project-asset:'.length)
  );
  expect(fixture.prepare).toHaveBeenCalledWith(
    expect.any(Blob),
    'image/svg+xml',
    'neutral-mark',
    expect.any(String),
    expect.any(Number),
    undefined,
    {
      publishToLibrary: false,
      requiredReviewAnnotationEffect: {
        aggregateId: 'recording:r',
        sourceAssetId: 'source',
        snapshotId: first.id,
        resourceId: 'neutral-mark',
        sha256: first.assets[0]!.sha256,
      },
    }
  );
  expect(
    fixture.session.getSnapshot().document.advancedContent.annotationEffects!.instances[0]!
      .transform
  ).toEqual({ x: 0, y: 0, width: 1, height: 1, rotation: 0 });
  await applyReviewAnnotationCatalogDocument(
    { ...fixture.args, catalog, documentId, start: 5 },
    fixture.deps
  );
  expect(fixture.prepare).toHaveBeenCalledOnce();
  expect(fixture.session.getSnapshot().snapshot.workspace.effectSnapshots).toEqual([first]);
  catalog.documents.length = 0;
  await fixture.session.history('undo');
  await fixture.session.history('redo');
  expect(fixture.session.getSnapshot().snapshot.workspace.effectSnapshots).toEqual([first]);
  await fixture.session.saveBuffered();
  expect(fixture.handles[0]!.publish).toHaveBeenCalledOnce();
  expect(fixture.handles[0]!.cancel).not.toHaveBeenCalled();
  expect(fixture.releases[0]).toHaveBeenCalledOnce();
  expect(
    await fixture.session.readAnnotationResource(first.assets[0]!.assetId, fixture.args.signal)
  ).toBeNull();
  await fixture.session.dispose();
});

it('retains failed Save resources and retries without acquiring or appending again', async () => {
  const fixture = setup();
  const catalog = await importedSvg();
  fixture.session.setAutosaveEnabled(true);
  fixture.save.mockRejectedValueOnce(new Error('quota'));
  await expect(
    applyReviewAnnotationCatalogDocument(
      { ...fixture.args, catalog, documentId: catalog.documents[0]!.id },
      fixture.deps
    )
  ).rejects.toThrow('quota');
  expect(fixture.session.getSnapshot().dirty).toBe(true);
  expect(fixture.handles[0]!.cancel).not.toHaveBeenCalled();
  expect(fixture.releases[0]).not.toHaveBeenCalled();
  await fixture.session.saveBuffered();
  expect(fixture.session.getSnapshot().snapshot.workspace.history).toHaveLength(1);
  expect(fixture.prepare).toHaveBeenCalledOnce();
  expect(fixture.handles[0]!.publish).toHaveBeenCalledOnce();
  await fixture.session.dispose();
});

it('abort during private retention cleans unadopted bytes and leaves history empty', async () => {
  const fixture = setup();
  const catalog = await importedSvg();
  const controller = new AbortController();
  const prepare = fixture.prepare.getMockImplementation()!;
  fixture.prepare.mockImplementationOnce(async (...args) => {
    const prepared = await prepare(...args);
    prepared.retainForSession = async () => {
      controller.abort();
      return fixture.releases[0]!;
    };
    return prepared;
  });
  await expect(
    applyReviewAnnotationCatalogDocument(
      { ...fixture.args, catalog, documentId: catalog.documents[0]!.id, signal: controller.signal },
      fixture.deps
    )
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect(fixture.handles[0]!.cancel).toHaveBeenCalledOnce();
  expect(fixture.handles[0]!.publish).not.toHaveBeenCalled();
  expect(fixture.releases[0]).toHaveBeenCalledOnce();
  expect(fixture.session.getSnapshot().snapshot.workspace.history).toEqual([]);
  await fixture.session.dispose();
});

it('unknown cleanup outcome releases its page exclusion and leaves publication evidence for recovery', async () => {
  const fixture = setup();
  const catalog = await importedSvg();
  const controller = new AbortController();
  const prepare = fixture.prepare.getMockImplementation()!;
  fixture.prepare.mockImplementationOnce(async (...args) => {
    const prepared = await prepare(...args);
    prepared.retainForSession = async () => {
      controller.abort();
      return fixture.releases[0]!;
    };
    return prepared;
  });
  fixture.read.mockRejectedValueOnce(new Error('private content unavailable'));
  await expect(
    applyReviewAnnotationCatalogDocument(
      { ...fixture.args, catalog, documentId: catalog.documents[0]!.id, signal: controller.signal },
      fixture.deps
    )
  ).rejects.toThrow('Annotation acquisition cleanup is deferred.');
  expect(fixture.handles[0]!.cancel).not.toHaveBeenCalled();
  expect(fixture.releases[0]).toHaveBeenCalledOnce();
  await fixture.session.dispose();
});

it('rejects disabled or non-standalone choices before acquisition', async () => {
  const fixture = setup();
  const original = await importedSvg();
  for (const catalog of [
    { ...original, enabled: false },
    {
      ...original,
      documents: original.documents.map((document) => ({
        ...document,
        kind: 'targetEffect' as const,
      })),
    },
  ]) {
    await expect(
      applyReviewAnnotationCatalogDocument(
        { ...fixture.args, catalog, documentId: original.documents[0]!.id },
        fixture.deps
      )
    ).rejects.toMatchObject({ code: catalog.enabled ? 'unsupported-kind' : 'catalog-disabled' });
  }
  expect(fixture.prepare).not.toHaveBeenCalled();
  expect(fixture.session.getSnapshot().snapshot.workspace.history).toEqual([]);
  await fixture.session.dispose();
});

it('uses the caller captured identity to locate admission after an unsuccessful Save', async () => {
  const fixture = setup();
  const catalog = await importedSvg();
  fixture.session.setAutosaveEnabled(true);
  fixture.save.mockRejectedValueOnce(new Error('quota'));
  await expect(
    applyReviewAnnotationCatalogDocument(
      {
        ...fixture.args,
        catalog,
        documentId: catalog.documents[0]!.id,
        instanceId: 'captured-command',
      },
      fixture.deps
    )
  ).rejects.toThrow('quota');
  expect(
    fixture.session.getSnapshot().document.advancedContent.annotationEffects?.instances
  ).toMatchObject([{ id: 'captured-command' }]);
  await fixture.session.saveBuffered();
  expect(fixture.session.getSnapshot().snapshot.workspace.history).toHaveLength(1);
  await fixture.session.dispose();
});
