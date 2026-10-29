import type { IDBPTransaction } from 'idb';
import type { AssetRef } from './contracts';
import { parseAssetOwner, parseAssetRef } from './guards';
import * as stores from '../infrastructure/indexed-db/core.stores';
import { parseMediaLibraryEntry } from '../media-library/read-guards';
import type { MediaLibraryEntry } from '../media-library/contracts';
import { parseImageWorkspaceEntry } from '../image-workspaces/parser';
import {
  parseProjectAssetEntry,
  parseProjectExportEntry,
  parseVideoProjectEntry,
} from '../projects/read-guards';
import {
  parseScenarioAssetEntry,
  parseScenarioExportEntry,
  parseScenarioProjectEntry,
} from '../scenario/read-guards';
import { parseScenarioStepEditorDocumentEntry } from '../scenario/editor-documents/index.guards';
import { readScenarioStorage } from '../scenario/storage';
import { getScenarioResourceReferences } from '../../../features/scenario/project/public';
import { freezeMediaInTransaction } from '../sync-capture/freeze';
import { collectCapturedProjectRecordingIds } from '../sync-capture/project-snapshot';
import { collectReviewAssetReferences } from '../review-workspaces/asset-refs';
import { readWorkspaceStorage } from '../review-workspaces/storage';
import { parseVideoWorkspace, parseVideoWorkspaceDraft } from '../review-workspaces/parser';
import { sameReviewVideoContainer } from '../../../features/video/review/validation';

/** All stores read directly or by the native metadata collectors. The caller owns the transaction. */
export const NATIVE_EDITING_RESOURCE_STORES = [
  stores.ASSET_REFS_STORE,
  stores.ASSET_OWNERS_STORE,
  stores.MEDIA_LIBRARY_STORE,
  stores.IMAGE_WORKSPACES_STORE,
  stores.PROJECT_ASSETS_STORE,
  stores.PROJECT_EXPORTS_STORE,
  stores.VIDEO_PROJECTS_STORE,
  stores.STORE_NAME,
  stores.RECORDING_TELEMETRY_STORE,
  stores.WEB_SNAPSHOTS_STORE,
  stores.VIDEO_WORKSPACES_STORE,
  stores.VIDEO_WORKSPACE_DRAFTS_STORE,
  stores.VIDEO_WORKSPACE_HISTORY_STORE,
  stores.THUMBNAILS_STORE,
  stores.AGGREGATE_PRESENTATIONS_STORE,
  stores.SCENARIO_PROJECTS_STORE,
  stores.SCENARIO_PROJECT_HISTORY_STORE,
  stores.SCENARIO_PROJECT_UNITS_STORE,
  stores.SCENARIO_ASSETS_STORE,
  stores.SCENARIO_EXPORTS_STORE,
  stores.SCENARIO_STEP_EDITOR_DOCUMENTS_STORE,
] as const;

type ReadTransaction = IDBPTransaction<unknown, string[], 'readonly' | 'readwrite'>;
interface NativeEditingResources {
  refs: AssetRef[];
  inlineMediaIds: string[];
}
export interface NativeEditingRoot {
  rootKind: 'media' | 'video-review' | 'video-project' | 'scenario-project';
  rootId: string;
}

function requireResource(condition: unknown): asserts condition {
  if (!condition) throw new Error('Native editing resources are unavailable.');
}

/** Project current native editing dependencies without reading original bytes or changing rows. */
export async function collectNativeEditingResources(
  tx: ReadTransaction,
  root: NativeEditingRoot,
  purpose: 'editing' | 'backup' = 'editing'
): Promise<NativeEditingResources> {
  const projection = new EditingResourceProjection(tx);
  switch (root.rootKind) {
    case 'media':
      await projection.media(root.rootId);
      break;
    case 'video-review':
      await projection.review(root.rootId);
      break;
    case 'video-project':
      await projection.project(root.rootId);
      break;
    case 'scenario-project':
      await projection.scenario(root.rootId);
      break;
  }
  if (purpose === 'backup') await projection.backup(root);
  return projection.result();
}

class EditingResourceProjection {
  private readonly refs = new Map<string, AssetRef>();
  private readonly inline = new Set<string>();
  private readonly mediaIds = new Set<string>();
  private readonly assetIds = new Set<string>();
  private readonly reviewIds = new Set<string>();
  private readonly mediaOriginals = new Map<string, AssetRef>();

  constructor(private readonly tx: ReadTransaction) {}

  result(): NativeEditingResources {
    return { refs: [...this.refs.values()], inlineMediaIds: [...this.inline] };
  }

  private addRef(ref: AssetRef): void {
    const previous = this.refs.get(ref.assetId);
    requireResource(!previous || JSON.stringify(previous) === JSON.stringify(ref));
    this.refs.set(ref.assetId, ref);
  }

  private async ref(assetId: string, binding?: { size: number; mimeType: string }) {
    const ref = parseAssetRef(await this.tx.objectStore(stores.ASSET_REFS_STORE).get(assetId));
    requireResource(ref && ref.assetId === assetId);
    requireResource(!binding || (ref.size === binding.size && ref.mimeType === binding.mimeType));
    this.addRef(ref);
    return ref;
  }

  private async owner(kind: string, id: string, role: string, assetId: string) {
    const owner = parseAssetOwner(
      await this.tx.objectStore(stores.ASSET_OWNERS_STORE).get([kind, id, role])
    );
    requireResource(
      owner &&
        owner.ownerKind === kind &&
        owner.ownerId === id &&
        owner.role === role &&
        owner.assetId === assetId
    );
  }

  async media(id: string): Promise<MediaLibraryEntry> {
    const media = parseMediaLibraryEntry(
      await this.tx.objectStore(stores.MEDIA_LIBRARY_STORE).get(id)
    );
    requireResource(media && media.id === id);
    if (this.mediaIds.has(id)) return media;
    this.mediaIds.add(id);
    if (media.kind === 'image' || media.kind === 'screenshot') {
      await this.image(media);
      return media;
    }
    if (media.source.kind === 'project-asset') {
      requireResource(media.id === `project-asset:${media.source.projectAssetId}`);
      const asset = await this.asset(media.source.projectAssetId);
      requireResource(
        asset.size === media.size && asset.mimeType === media.mimeType && media.blob === undefined
      );
      const ref = await this.ref(asset.assetId, media);
      this.mediaOriginals.set(id, ref);
      await this.optionalReview(id, ref);
      return media;
    }
    const rows = await freezeMediaInTransaction(this.tx, id, { allowIndependentReview: true });
    this.addRef(rows.ref);
    this.mediaOriginals.set(id, rows.ref);
    if ('screenshotRef' in rows) this.addRef(rows.screenshotRef);
    await this.optionalReview(id, rows.ref);
    return media;
  }

  private async image(media: MediaLibraryEntry) {
    if (media.source.kind === 'screenshot') {
      requireResource(
        !media.blob ||
          (media.blob.size === media.size &&
            (!media.blob.type || media.blob.type === media.mimeType))
      );
      this.inline.add(media.id);
    } else if (media.source.kind === 'stored-asset') {
      requireResource(media.blob === undefined);
      await this.owner('media-library', media.id, 'source', media.source.assetId);
      this.mediaOriginals.set(media.id, await this.ref(media.source.assetId, media));
    } else {
      requireResource(media.source.kind === 'project-asset');
      const asset = await this.asset(media.source.projectAssetId);
      requireResource(
        media.id === `project-asset:${asset.id}` &&
          asset.size === media.size &&
          asset.mimeType === media.mimeType
      );
      this.mediaOriginals.set(media.id, await this.ref(asset.assetId, media));
    }
    const raw: unknown = await this.tx.objectStore(stores.IMAGE_WORKSPACES_STORE).get(media.id);
    if (raw === undefined) return;
    const workspace = parseImageWorkspaceEntry(raw);
    requireResource(
      workspace &&
        workspace.aggregateId === media.id &&
        workspace.revision === media.workspaceRevision
    );
    for (const asset of workspace.document.assets) await this.ref(asset.assetId);
  }

  private async sourceAsset(id: string) {
    const asset = parseProjectAssetEntry(
      await this.tx.objectStore(stores.PROJECT_ASSETS_STORE).get(id)
    );
    requireResource(asset && asset.id === id);
    await this.owner('project-asset', id, 'body', asset.assetId);
    return { asset, ref: await this.ref(asset.assetId, asset) };
  }

  private async asset(id: string) {
    const { asset, ref } = await this.sourceAsset(id);
    if (this.assetIds.has(id)) return asset;
    this.assetIds.add(id);
    if (asset.originMediaId) await this.media(asset.originMediaId);
    const mirrorId = `project-asset:${id}`;
    const raw: unknown = await this.tx.objectStore(stores.MEDIA_LIBRARY_STORE).get(mirrorId);
    if (raw !== undefined) {
      const mirror = await this.media(mirrorId);
      requireResource(
        mirror.source.kind === 'project-asset' && mirror.source.projectAssetId === id
      );
    } else await this.optionalReview(mirrorId, ref);
    return asset;
  }

  private async optionalReview(id: string, ref: AssetRef, sourceMediaId = id) {
    if (this.reviewIds.has(id)) return;
    const stored = await readWorkspaceStorage(this.tx, id);
    const rawDraft: unknown = await this.tx
      .objectStore(stores.VIDEO_WORKSPACE_DRAFTS_STORE)
      .get(id);
    if (stored.logical === undefined && rawDraft === undefined) return;
    const workspace = parseVideoWorkspace(stored.logical);
    requireResource(
      workspace &&
        workspace.aggregateId === id &&
        (workspace.sourceMediaId ?? id) === sourceMediaId &&
        workspace.sourceAssetId === ref.assetId &&
        workspace.source.size === ref.size &&
        ref.mimeType.startsWith('video/') &&
        sameReviewVideoContainer(workspace.source.mimeType, ref.mimeType)
    );
    const draft =
      rawDraft === undefined ? null : parseVideoWorkspaceDraft(rawDraft, workspace.source.duration);
    requireResource(rawDraft === undefined || (draft && draft.aggregateId === id));
    this.reviewIds.add(id);
    for (const reference of collectReviewAssetReferences(workspace)) {
      requireResource(reference.startsWith('project-asset:'));
      await this.asset(reference.slice('project-asset:'.length));
    }
  }

  async review(id: string) {
    const stored = await readWorkspaceStorage(this.tx, id);
    if (stored.logical === undefined) {
      await this.media(id);
      return;
    }
    const workspace = parseVideoWorkspace(stored.logical);
    requireResource(workspace && workspace.aggregateId === id);
    const sourceId = workspace.sourceMediaId ?? id;
    const media = parseMediaLibraryEntry(
      await this.tx.objectStore(stores.MEDIA_LIBRARY_STORE).get(sourceId)
    );
    if (!media) {
      let ref: AssetRef;
      if (sourceId.startsWith('export:')) {
        const entry = parseProjectExportEntry(
          await this.tx
            .objectStore(stores.PROJECT_EXPORTS_STORE)
            .get(sourceId.slice('export:'.length))
        );
        requireResource(entry && sourceId === `export:${entry.id}`);
        await this.owner('project-export', entry.id, 'body', entry.assetId);
        ref = await this.ref(entry.assetId);
        requireResource(ref.size === entry.size && ref.mimeType === entry.mimeType);
      } else {
        requireResource(sourceId.startsWith('project-asset:'));
        ref = (await this.sourceAsset(sourceId.slice('project-asset:'.length))).ref;
      }
      this.mediaIds.add(sourceId);
      this.mediaOriginals.set(sourceId, ref);
      await this.optionalReview(id, ref, sourceId);
      return;
    }
    requireResource(media.id === sourceId && media.blob === undefined);
    let ref: AssetRef;
    if (media.source.kind === 'project-asset') {
      requireResource(sourceId === `project-asset:${media.source.projectAssetId}`);
      const source = await this.sourceAsset(media.source.projectAssetId);
      requireResource(source.asset.size === media.size && source.asset.mimeType === media.mimeType);
      ref = source.ref;
    } else {
      const source = await freezeMediaInTransaction(this.tx, sourceId, {
        allowIndependentReview: true,
      });
      ref = source.ref;
      this.addRef(ref);
    }
    // An archived Review borrows original bytes, not another Review on the same media.
    this.mediaIds.add(sourceId);
    this.mediaOriginals.set(sourceId, ref);
    await this.optionalReview(id, ref, sourceId);
  }

  async project(id: string) {
    const entry = parseVideoProjectEntry(
      await this.tx.objectStore(stores.VIDEO_PROJECTS_STORE).get(id)
    );
    requireResource(entry && entry.id === id);
    for (const recordingId of collectCapturedProjectRecordingIds(entry.project))
      await this.media(`recording:${recordingId}`);
    for (const asset of entry.project.assets) {
      const source = asset.source;
      let binding: { size: number; mimeType: string };
      switch (source.kind) {
        case 'project-asset':
          binding = await this.asset(source.projectAssetId);
          if (source.originMediaId) await this.media(source.originMediaId);
          break;
        case 'library-asset':
          binding = await this.media(source.mediaId);
          break;
        case 'recording':
          binding = await this.media(`recording:${source.recordingId}`);
          break;
        case 'scenario-asset':
          binding = await this.scenarioAsset(source.scenarioAssetId);
          break;
      }
      requireResource(
        binding.size === asset.metadata.size && binding.mimeType === asset.metadata.mimeType
      );
    }
  }

  async backup(root: NativeEditingRoot): Promise<void> {
    if (root.rootKind === 'video-project') {
      for (const raw of await this.tx
        .objectStore(stores.PROJECT_EXPORTS_STORE)
        .index('projectId')
        .getAll(root.rootId)) {
        const entry = parseProjectExportEntry(raw);
        requireResource(entry && entry.projectId === root.rootId);
        await this.owner('project-export', entry.id, 'body', entry.assetId);
        const ref = await this.ref(entry.assetId);
        requireResource(
          ref.size === entry.size && (!entry.mimeType || entry.mimeType === ref.mimeType)
        );
        await this.optionalReview(`export:${entry.id}`, ref);
      }
    }
    if (root.rootKind === 'scenario-project') {
      for (const raw of await this.tx
        .objectStore(stores.SCENARIO_ASSETS_STORE)
        .index('projectId')
        .getAll(root.rootId)) {
        const entry = parseScenarioAssetEntry(raw);
        requireResource(entry && entry.projectId === root.rootId);
        await this.scenarioAsset(entry.id, root.rootId);
      }
      for (const raw of await this.tx
        .objectStore(stores.SCENARIO_STEP_EDITOR_DOCUMENTS_STORE)
        .index('projectId')
        .getAll(root.rootId)) {
        const document = parseScenarioStepEditorDocumentEntry(raw);
        requireResource(document && document.projectId === root.rootId);
        for (const asset of document.document.assets) await this.ref(asset.assetId);
      }
      for (const raw of await this.tx
        .objectStore(stores.SCENARIO_EXPORTS_STORE)
        .index('projectId')
        .getAll(root.rootId)) {
        const entry = parseScenarioExportEntry(raw);
        requireResource(entry && entry.projectId === root.rootId);
        if (!entry.html) continue;
        await this.owner('scenario-export', entry.id, 'body', entry.html.assetId);
        const ref = await this.ref(entry.html.assetId);
        requireResource(
          ref.size === entry.size && /^text\/html(?:;charset=utf-8)?$/iu.test(ref.mimeType)
        );
      }
    }
  }

  private async scenarioAsset(id: string, projectId?: string) {
    const asset = parseScenarioAssetEntry(
      await this.tx.objectStore(stores.SCENARIO_ASSETS_STORE).get(id)
    );
    requireResource(asset && asset.id === id && (!projectId || asset.projectId === projectId));
    await this.owner('scenario-asset', id, 'body', asset.assetId);
    await this.ref(asset.assetId, asset);
    if (asset.galleryAssetId) {
      const media = await this.media(asset.galleryAssetId);
      if (asset.borrowedMediaId) {
        requireResource(
          media.size === asset.size &&
            media.mimeType === asset.mimeType &&
            this.mediaOriginals.get(media.id)?.assetId === asset.assetId
        );
      }
    }
    return asset;
  }

  async scenario(id: string) {
    const entry = parseScenarioProjectEntry((await readScenarioStorage(this.tx, id)).logical);
    requireResource(entry && entry.id === id);
    const assets = new Set<string>();
    const documents = new Set<string>();
    for (const project of [
      entry.project,
      ...(entry.history ?? []).map((version) => version.project),
    ]) {
      const references = getScenarioResourceReferences(project);
      for (const asset of references.assets) assets.add(asset);
      for (const document of references.documents) documents.add(document);
    }
    for (const asset of assets) await this.scenarioAsset(asset, id);
    for (const stepId of documents) {
      const document = parseScenarioStepEditorDocumentEntry(
        await this.tx.objectStore(stores.SCENARIO_STEP_EDITOR_DOCUMENTS_STORE).get(stepId)
      );
      requireResource(document && document.projectId === id && document.stepId === stepId);
      for (const asset of document.document.assets) await this.ref(asset.assetId);
    }
  }
}
