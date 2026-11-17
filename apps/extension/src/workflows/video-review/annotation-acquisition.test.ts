import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { expect, it, vi, type Mock } from 'vitest';
import { parseAnimationTemplateSource } from '@sniptale/runtime-contracts/animation-template';
import { readValidAnimationCatalog } from '../../composition/persistence/effect-bundles/fixture.test-support';
import { resolveEffectControlDefault } from '@sniptale/runtime-contracts/effect-controls';
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
import {
  applyReviewAnnotationCatalogDocument,
  ReviewAnnotationAcquisitionError,
} from './annotation-acquisition';
import { buildReviewTimeMap } from '../../features/video/review/timeline';
import * as annotationValidation from '../../features/video/review/annotation-effects/validation';
import type { ReviewEdit } from '../../features/video/review/types';

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

async function importedAnimation(): Promise<EffectBundleCatalogEntry> {
  const catalog = await readValidAnimationCatalog();
  return { ...catalog, packId: 'imported-animation' };
}

it.each([
  'sniptale-lower-third',
  'sniptale-title',
  'sniptale-chapters',
  'sniptale-leader-labels',
  'sniptale-frame',
  'sniptale-corners',
  'sniptale-arrow',
  'interview-tag',
  'interview-rule',
  'interview-center',
])(
  'applies the actual lazy %s builtin with declared controls, fixed anchors and one local history operation',
  async (name) => {
    const fixture = setup();
    const catalog = await builtins.load();
    const choice = catalog.documents.find((entry) => entry.id === name)!;
    const id = await applyReviewAnnotationCatalogDocument(
      { ...fixture.args, catalog, documentId: choice.id },
      fixture.deps
    );
    const snapshot = fixture.session.getSnapshot();
    const instance = snapshot.document.advancedContent.annotationEffects!.instances[0]!;
    const retained = snapshot.snapshot.workspace.effectSnapshots![0]!;
    const document = parseAnimationTemplateSource(retained.source).template!;
    expect(instance).toMatchObject({
      id,
      start: 2,
      end: Math.min(
        10,
        2 + (document.animation.op - document.animation.ip) / document.animation.fr
      ),
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
        expect(instance.controls[control.id]).toBe(resolveEffectControlDefault(control, 'ru'));
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

it('retains embedded source bytes without private acquisition and survives catalogue removal', async () => {
  const fixture = setup(),
    catalog = await importedAnimation(),
    source = catalog.documents[0]!.source!;
  await applyReviewAnnotationCatalogDocument(
    { ...fixture.args, catalog, documentId: catalog.documents[0]!.id },
    fixture.deps
  );
  const first = fixture.session.getSnapshot().snapshot.workspace.effectSnapshots![0]!;
  expect(first.source).toBe(source);
  expect(first.assets).toEqual([]);
  expect(JSON.parse(first.source).resources.length).toBeGreaterThan(0);
  expect(fixture.prepare).not.toHaveBeenCalled();
  expect(fixture.save).not.toHaveBeenCalled();
  catalog.documents = [];
  expect(fixture.session.getSnapshot().snapshot.workspace.effectSnapshots![0]!.source).toBe(source);
  expect(fixture.session.getSnapshot().snapshot.workspace.history).toHaveLength(1);
  await fixture.session.dispose();
});

it('retains failed Save source bytes and retries without acquiring or appending again', async () => {
  const fixture = setup();
  const catalog = await importedAnimation();
  fixture.session.setAutosaveEnabled(true);
  fixture.save.mockRejectedValueOnce(new Error('quota'));
  await expect(
    applyReviewAnnotationCatalogDocument(
      { ...fixture.args, catalog, documentId: catalog.documents[0]!.id },
      fixture.deps
    )
  ).rejects.toThrow('quota');
  expect(fixture.session.getSnapshot().dirty).toBe(true);
  expect(fixture.handles).toEqual([]);
  await fixture.session.saveBuffered();
  expect(fixture.session.getSnapshot().snapshot.workspace.history).toHaveLength(1);
  expect(fixture.prepare).not.toHaveBeenCalled();
  await fixture.session.dispose();
});

it('cancels during catalogue verification before admitting source bytes or history', async () => {
  const fixture = setup(),
    catalog = await importedAnimation(),
    controller = new AbortController();
  const read = vi.fn(async (...args: Parameters<typeof readVerifiedCatalogDocument>) => {
    const result = await readVerifiedCatalogDocument(...args);
    controller.abort();
    return result;
  });
  await expect(
    applyReviewAnnotationCatalogDocument(
      { ...fixture.args, catalog, documentId: catalog.documents[0]!.id, signal: controller.signal },
      { readVerifiedCatalogDocument: read }
    )
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect(fixture.prepare).not.toHaveBeenCalled();
  expect(fixture.session.getSnapshot().snapshot.workspace.history).toEqual([]);
  await fixture.session.dispose();
});
it('refuses altered verified source before admission without publishing resources', async () => {
  const fixture = setup(),
    catalog = await importedAnimation();
  const loaded = await readVerifiedCatalogDocument(catalog, catalog.documents[0]!.id);
  await expect(
    applyReviewAnnotationCatalogDocument(
      { ...fixture.args, catalog, documentId: catalog.documents[0]!.id },
      {
        readVerifiedCatalogDocument: async () => ({
          ...loaded,
          catalogDocument: { ...loaded.catalogDocument, source: '{}' },
        }),
      }
    )
  ).rejects.toThrow();
  expect(fixture.prepare).not.toHaveBeenCalled();
  expect(fixture.save).not.toHaveBeenCalled();
  expect(fixture.session.getSnapshot().snapshot.workspace.history).toEqual([]);
  await fixture.session.dispose();
});

it('rejects disabled or non-standalone choices before acquisition', async () => {
  const fixture = setup();
  const original = await importedAnimation();
  const retired = structuredClone(original);
  retired.documents.forEach((document) => Reflect.set(document, 'kind', 'targetEffect'));
  for (const catalog of [{ ...original, enabled: false }, retired]) {
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
  const catalog = await importedAnimation();
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

it.each([
  { phase: 'catalog', changesMap: true },
  { phase: 'verification', changesMap: true },
  { phase: 'catalog', changesMap: false },
  { phase: 'verification', changesMap: false },
] as const)(
  'revalidates the captured temporal target after $phase await (changesMap=$changesMap)',
  async ({ phase, changesMap }) => {
    const fixture = setup();
    const catalog = await importedAnimation();
    const cut: Extract<ReviewEdit, { kind: 'cut' }> = {
      id: 'existing-cut',
      kind: 'cut',
      start: 6,
      end: 7,
      requestedStart: 6,
      requestedEnd: 7,
    };
    await fixture.session.commit({
      id: 'create-cut',
      at: 1,
      target: 'edit',
      before: null,
      after: cut,
    });
    const temporalMap = () =>
      JSON.stringify(buildReviewTimeMap(10, fixture.session.getSnapshot().document.edits));
    const capturedMap = temporalMap();
    const assertCurrentTarget = () => {
      if (temporalMap() !== capturedMap)
        throw new ReviewAnnotationAcquisitionError('changed-source');
    };
    let reportReached!: () => void;
    let resume!: () => void;
    const reached = new Promise<void>((resolve) => {
      reportReached = resolve;
    });
    const held = new Promise<void>((resolve) => {
      resume = resolve;
    });
    const read = async (...args: Parameters<typeof readVerifiedCatalogDocument>) => {
      const loaded = await readVerifiedCatalogDocument(...args);
      if (phase === 'catalog') {
        reportReached();
        await held;
      }
      return loaded;
    };
    const verify = annotationValidation.verifyReviewAnnotationEffectSnapshot;
    const verification =
      phase === 'verification'
        ? vi
            .spyOn(annotationValidation, 'verifyReviewAnnotationEffectSnapshot')
            .mockImplementationOnce(async (...args) => {
              const verified = await verify(...args);
              reportReached();
              await held;
              return verified;
            })
        : undefined;
    const apply = vi.spyOn(fixture.session, 'applyAnnotationEffect');
    const pending = applyReviewAnnotationCatalogDocument(
      {
        ...fixture.args,
        catalog,
        documentId: catalog.documents[0]!.id,
        start: 2,
        end: 4,
        timeDomain: 'result',
        assertCurrentTarget,
      },
      { readVerifiedCatalogDocument: read }
    );
    const outcome = pending.then(
      (id) => ({ id, error: null }),
      (error: unknown) => ({ id: null, error })
    );
    try {
      await reached;
      // Both writes keep the source identity and durable revision; only one changes result-time coordinates.
      await fixture.session.commit({
        id: 'update-cut',
        at: 2,
        target: 'edit',
        before: cut,
        after: { ...cut, requestedStart: 5.5, ...(changesMap ? { start: 5.5 } : {}) },
      });
      expect(fixture.session.getSnapshot().snapshot.workspace.revision).toBe(1);
      if (changesMap) expect(temporalMap()).not.toBe(capturedMap);
      else expect(temporalMap()).toBe(capturedMap);
      resume();
      const result = await outcome;
      if (changesMap) {
        expect(result.error).toMatchObject({ code: 'changed-source' });
        expect(apply).not.toHaveBeenCalled();
        expect(
          fixture.session.getSnapshot().document.advancedContent.annotationEffects?.instances ?? []
        ).toEqual([]);
        expect(fixture.session.getSnapshot().snapshot.workspace.effectSnapshots ?? []).toEqual([]);
        expect(fixture.session.getSnapshot().snapshot.workspace.history).toHaveLength(2);
      } else {
        expect(result.error).toBeNull();
        expect(apply).toHaveBeenCalledOnce();
        expect(
          fixture.session.getSnapshot().document.advancedContent.annotationEffects?.instances
        ).toMatchObject([{ id: result.id, start: 2, end: 4, timeDomain: 'result' }]);
        expect(fixture.session.getSnapshot().snapshot.workspace.history).toHaveLength(3);
      }
      expect(fixture.save).not.toHaveBeenCalled();
    } finally {
      resume();
      await outcome;
      verification?.mockRestore();
      apply.mockRestore();
      await fixture.session.dispose();
    }
  }
);
