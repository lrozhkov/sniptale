import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { buildVideoEffectIndex } from '../../composition/persistence/effect-bundles/fixture.test-support';
import { createBuiltinEffectResources } from '../../composition/persistence/effect-bundles/builtin';
import { resolveCatalogDocument } from '../../features/video/project/effect-bundle/catalog/resolution';
import { expect, it, vi } from 'vitest';
import type { VideoWorkspaceSnapshot } from '../../composition/persistence/review-workspaces/contracts';
import {
  parseVideoWorkspace,
  parseVideoWorkspaceDraft,
} from '../../composition/persistence/review-workspaces/parser';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
import { createVideoReviewSession } from './session';
import { applyReviewAnnotationCatalogDocument } from './annotation-acquisition';

it(
  'adds a Lottie package through the real Gallery session, retains it ' +
    'across Undo/Redo and saves/reopens it',
  async () => {
    let stored: VideoWorkspaceSnapshot = {
      workspace: {
        aggregateId: 'recording:lottie-proof',
        sourceAssetId: 'source',
        formatVersion: 1,
        source: { duration: 10, width: 320, height: 180, mimeType: 'video/webm', size: 1 },
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
        if (!workspace) throw new Error('Invalid saved workspace.');
        const draft =
          args.draft === null
            ? null
            : parseVideoWorkspaceDraft(args.draft, workspace.source.duration);
        if (args.draft !== null && !draft) throw new Error('Invalid saved draft.');
        stored = { workspace: { ...workspace, revision: stored.workspace.revision + 1 }, draft };
        return structuredClone(stored);
      }
    );
    const deps = {
      readVideoWorkspace: read,
      moveVideoWorkspaceHistory: read,
      saveVideoWorkspaceAdvanced: read,
      saveVideoWorkspaceDraft: read,
      commitVideoWorkspace: read,
      saveVideoWorkspaceSnapshot: save,
    };
    const root = resolve('apps/extension/public/video-effects');
    const index = await buildVideoEffectIndex(root);
    const catalog = await createBuiltinEffectResources(
      async (path) =>
        new Uint8Array(
          path === 'index.json'
            ? new TextEncoder().encode(JSON.stringify(index))
            : await readFile(resolve(root, path))
        )
    ).load();
    const selected = await resolveCatalogDocument(catalog, 'sniptale-callout');
    const source = selected.documents[0]!.source!;
    const session = createVideoReviewSession(stored, deps);
    session.setAutosaveEnabled(false);
    try {
      await applyReviewAnnotationCatalogDocument({
        session,
        catalog,
        documentId: 'sniptale-callout',
        instanceId: 'animation-1',
        start: 2,
        locale: 'ru',
        plane: { width: 320, height: 180 },
        signal: new AbortController().signal,
      });
      expect(
        session.getSnapshot().document.advancedContent.annotationEffects!.instances
      ).toHaveLength(1);
      expect(session.getSnapshot().snapshot.workspace.effectSnapshots![0]).toMatchObject({
        source,
        assets: [],
      });
      expect(save).not.toHaveBeenCalled();
      await session.history('undo');
      expect(
        session.getSnapshot().document.advancedContent.annotationEffects?.instances ?? []
      ).toHaveLength(0);
      await session.history('redo');
      expect(
        session.getSnapshot().document.advancedContent.annotationEffects!.instances[0]!.id
      ).toBe('animation-1');
      catalog.documents.length = 0;
      await session.saveBuffered();
      expect(save).toHaveBeenCalledOnce();
      expect(stored.workspace.effectSnapshots![0]!.source).toBe(source);
      const reopened = createVideoReviewSession(structuredClone(stored), deps);
      reopened.setAutosaveEnabled(false);
      try {
        const state = reopened.getSnapshot();
        expect(state.document.advancedContent.annotationEffects!.instances[0]!.id).toBe(
          'animation-1'
        );
        expect(state.snapshot.workspace.effectSnapshots![0]!.source).toBe(source);
      } finally {
        await reopened.dispose();
      }
    } finally {
      await session.dispose();
    }
  }
);
