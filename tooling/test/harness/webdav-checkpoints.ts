import { inspectMediaHubBackupV6 } from '../../../apps/extension/src/workflows/media-hub-backup/v6/inspect';
import { openArchiveReader } from '../../../apps/extension/src/composition/archive-transfer';
import { parseBackupRootEnvelope } from '../../../apps/extension/src/workflows/media-hub-backup/v6/shared-object-envelope';
import { decodeBackupMetadata } from '../../../apps/extension/src/workflows/media-hub-backup/v6/metadata-transport';
import { parseBoundedJson } from '../../../apps/extension/src/workflows/media-hub-backup/v6/codec';
import { MAX_ROOT_METADATA_BYTES } from '../../../apps/extension/src/workflows/media-hub-backup/v6/contracts';
import { parsePortableScenarioProjectMetadata } from '../../../apps/extension/src/workflows/media-hub-backup/v6/root-codecs/projects';
import { saveScreenshotMediaAsset } from '../../../apps/extension/src/composition/persistence/media-library/index.screenshots';
import { saveScenarioExportRecord } from '../../../apps/extension/src/composition/persistence/scenario/store/project-records/exports';
import {
  createScenarioHtmlCapture,
  readScenarioHtmlArtifact,
} from '../../../apps/extension/src/composition/persistence/scenario/export-artifacts';
import { MissingAssetObjectError } from '../../../apps/extension/src/composition/persistence/assets/opfs-store';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { initDB } from '../../../apps/extension/src/composition/persistence/infrastructure/indexed-db/core';
import * as stores from '../../../apps/extension/src/composition/persistence/infrastructure/indexed-db/core.stores';
import { parseSyncCaptureRecord } from '../../../apps/extension/src/composition/persistence/sync-capture/guards';
import { parseSyncQueueOperation } from '../../../apps/extension/src/composition/persistence/sync-capture/queue-model';
import {
  parseConnectionMetadata,
  sameConnectionScope,
} from '../../../apps/extension/src/composition/persistence/remote-connection/model';
import {
  collectNativeEditingResources,
  NATIVE_EDITING_RESOURCE_STORES,
  type NativeEditingRoot,
} from '../../../apps/extension/src/composition/persistence/assets/editing-resources';
import {
  readAssetFile,
  parseAssetRef,
  parseAssetOwner,
} from '../../../apps/extension/src/composition/persistence/assets';
import { parseMediaLibraryEntry } from '../../../apps/extension/src/composition/persistence/media-library/read-guards';
import { readStoredImageWorkspace } from '../../../apps/extension/src/composition/persistence/image-workspaces/read';
import { readVideoWorkspace } from '../../../apps/extension/src/composition/persistence/review-workspaces/store';
import {
  replayReviewHistory,
  reviewDocumentBaseline,
} from '../../../apps/extension/src/features/video/review/document';
import { parseVideoProjectEntry } from '../../../apps/extension/src/composition/persistence/projects/read-guards';
import { readScenarioStorage } from '../../../apps/extension/src/composition/persistence/scenario/storage';
import {
  parseScenarioProjectEntry,
  parseScenarioExportEntry,
} from '../../../apps/extension/src/composition/persistence/scenario/read-guards';
import {
  createGuideProject,
  createGuideStep,
  createGuideParagraphs,
  createGuideImageBlock,
} from '../../../apps/extension/src/features/scenario/project/factories';
import { createScenarioAssetEntryFromBlob } from '../../../apps/extension/src/composition/persistence/scenario/store/capture-step/asset-entry';
import { commitScenarioAggregateMutation } from '../../../apps/extension/src/composition/persistence/scenario/aggregate-mutations';
import { digestBackupObject } from '../../../apps/extension/src/workflows/media-hub-backup/v6/shared-objects';

function check(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

/** A fixture must preserve the actual Settings enrollment and its exact native scope. */
export async function requireCheckpointFixtureProfile() {
  const db = await initDB();
  const [profileValue, connectionValue] = await Promise.all([
    db.get(stores.SYNC_CAPTURE_STORE, 'profile'),
    db.get(stores.SYNC_CONNECTION_STORE, 'connection'),
  ]);
  const profile = parseSyncCaptureRecord(profileValue);
  const connection = parseConnectionMetadata(connectionValue);
  check(
    profile?.kind === 'profile' &&
      profile.enabled &&
      connection &&
      (connection.phase === 'active' || connection.phase === 'paused') &&
      sameConnectionScope(connection.binding, {
        spaceId: profile.spaceId,
        connectionGeneration: profile.connectionGeneration,
        profileCreatedAt: profile.createdAt,
      }),
    'The current enrolled fixture profile is unavailable.'
  );
  return {
    spaceId: profile.spaceId,
    connectionGeneration: profile.connectionGeneration,
    profileCreatedAt: profile.createdAt,
  };
}

async function hash(blob: Blob) {
  return digestBackupObject({
    size: blob.size,
    pipeTo: (sink, signal) => blob.stream().pipeTo(sink, signal ? { signal } : {}),
  });
}

function checkedRoot(value: unknown): NativeEditingRoot {
  check(
    isRecord(value) &&
      Object.keys(value).length === 2 &&
      typeof value['rootId'] === 'string' &&
      value['rootId'].length > 0 &&
      value['rootId'].length <= 256,
    'Invalid checkpoint fixture root.'
  );
  const rootKind = value['rootKind'];
  check(
    rootKind === 'media' ||
      rootKind === 'video-review' ||
      rootKind === 'video-project' ||
      rootKind === 'scenario-project',
    'Invalid checkpoint fixture root kind.'
  );
  return { rootKind, rootId: value['rootId'] };
}

async function logicalState(root: NativeEditingRoot) {
  const db = await initDB();
  switch (root.rootKind) {
    case 'media': {
      const workspace = await readStoredImageWorkspace(root.rootId);
      check(workspace, 'Image fixture workspace is unavailable.');
      const { backgroundImage: _image, ...frame } = workspace.document.frame;
      return {
        revision: workspace.revision,
        logical: {
          frame,
          canvasWidth: workspace.document.canvasWidth,
          canvasHeight: workspace.document.canvasHeight,
        },
      };
    }
    case 'video-review': {
      const snapshot = await readVideoWorkspace(root.rootId);
      check(snapshot, 'Review fixture workspace is unavailable.');
      return {
        revision: snapshot.workspace.revision,
        logical: {
          project: snapshot.workspace.project,
          document: replayReviewHistory(
            snapshot.workspace.history,
            snapshot.workspace.cursor,
            snapshot.workspace.source,
            reviewDocumentBaseline(snapshot.workspace)
          ),
        },
      };
    }
    case 'video-project': {
      const entry = parseVideoProjectEntry(await db.get(stores.VIDEO_PROJECTS_STORE, root.rootId));
      check(entry, 'Montage fixture workspace is unavailable.');
      return {
        revision: entry.workspaceRevision ?? 0,
        logical: {
          name: entry.project.name,
          backgroundColor: entry.project.backgroundColor,
          sceneBackground: entry.project.sceneBackground ?? null,
          clips: entry.project.clips.map((clip) => ({
            id: clip.id,
            type: clip.type,
            transform: clip.transform,
            ...('windowCornerRadius' in clip ? { radius: clip.windowCornerRadius } : {}),
            ...('shadowIntensity' in clip ? { shadow: clip.shadowIntensity } : {}),
          })),
        },
      };
    }
    case 'scenario-project': {
      const tx = db.transaction(
        [
          stores.SCENARIO_PROJECTS_STORE,
          stores.SCENARIO_PROJECT_HISTORY_STORE,
          stores.SCENARIO_PROJECT_UNITS_STORE,
        ],
        'readonly'
      );
      const entry = parseScenarioProjectEntry((await readScenarioStorage(tx, root.rootId)).logical);
      await tx.done;
      check(entry, 'Scenario fixture workspace is unavailable.');
      return {
        revision: entry.workspaceRevision,
        logical: {
          name: entry.project.name,
          style: entry.project.style,
          items: entry.project.items.map((item) =>
            item.kind === 'step'
              ? {
                  id: item.id,
                  title: item.title,
                  layout: item.layout,
                  styleOverrides: item.styleOverrides,
                  blocks: item.blocks.map((block) =>
                    block.kind === 'text'
                      ? { id: block.id, kind: block.kind, paragraphs: block.paragraphs }
                      : { id: block.id, kind: block.kind }
                  ),
                }
              : { id: item.id, kind: item.kind }
          ),
        },
      };
    }
  }
}

/** Disposable seeds and read-only evidence. Authored acceptance changes must use real editor controls. */
export function createWebdavCheckpointHarness() {
  return {
    async inspectBackup(filename: string) {
      check(
        filename === 'backup-all-proof.zip' || filename === 'backup-selected-proof.zip',
        'Invalid backup fixture filename.'
      );
      const handle = await (await navigator.storage.getDirectory()).getFileHandle(filename);
      const blob = await handle.getFile();
      const inspection = await inspectMediaHubBackupV6(blob);
      const reader = await openArchiveReader(blob);
      try {
        const files = [];
        for (const item of reader.entries()) {
          const entry = reader.entry(item.path);
          if (!entry) throw new Error('Inspected backup entry is missing.');
          files.push({ size: item.size, sha256: await digestBackupObject(entry) });
        }
        const scenarios = [];
        for (const descriptor of inspection.descriptors.filter(
          (item) => item.rootKind === 'scenario-project'
        )) {
          const entry = reader.entry(descriptor.metadataPath);
          if (!entry) throw new Error('Scenario backup metadata is missing.');
          const { envelope } = parseBackupRootEnvelope(
            parseBoundedJson(await entry.text(MAX_ROOT_METADATA_BYTES), MAX_ROOT_METADATA_BYTES),
            inspection.manifest
          );
          const decoded = await decodeBackupMetadata(reader, envelope);
          const metadata = parsePortableScenarioProjectMetadata(decoded.envelope.metadata);
          const project = metadata.entry.project;
          if (
            typeof project !== 'object' ||
            project === null ||
            Array.isArray(project) ||
            typeof project['name'] !== 'string'
          )
            throw new Error('Scenario archive name is invalid.');
          scenarios.push({
            id: metadata.entry.id,
            name: project['name'],
            exports: metadata.exports.map((item) => item.id),
          });
        }
        return {
          roots: inspection.descriptors.map(({ rootKind, rootId }) => ({ rootKind, rootId })),
          rootIds: inspection.descriptors
            .filter((item) => item.rootKind === 'scenario-project')
            .map((item) => item.rootId),
          files,
          scenarios,
        };
      } finally {
        await reader.close();
      }
    },
    async seedTemporaryScreenshot(bytes: number[]) {
      const scope = await requireCheckpointFixtureProfile();
      check(
        Array.isArray(bytes) &&
          bytes.length > 8 &&
          bytes.length <= 1024 * 1024 &&
          bytes.every((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255),
        'Invalid temporary screenshot fixture image.'
      );
      const saved = await saveScreenshotMediaAsset({
        filename: 'Backup excluded draft.png',
        blob: new Blob([Uint8Array.from(bytes)], { type: 'image/png' }),
        storageClass: 'temporary',
      });
      const db = await initDB();
      const media = parseMediaLibraryEntry(await db.get(stores.MEDIA_LIBRARY_STORE, saved.id));
      check(
        media &&
          media.id === saved.id &&
          media.kind === 'screenshot' &&
          media.source.kind === 'screenshot' &&
          media.lifecycle.storageClass === 'temporary' &&
          media.blob &&
          media.blob.size === bytes.length &&
          media.size === media.blob.size,
        'Temporary screenshot native readback is unavailable.'
      );
      const root = { rootKind: 'media' as const, rootId: media.id };
      const rootKey = JSON.stringify([scope.spaceId, root.rootKind, root.rootId]);
      const records = (await db.getAll(stores.SYNC_CAPTURE_STORE)).flatMap((raw) => {
        const record = parseSyncCaptureRecord(raw);
        check(record, 'Invalid native capture fixture metadata.');
        return record.spaceId === scope.spaceId ? [record] : [];
      });
      return {
        root,
        filename: media.filename,
        lifecycle: media.lifecycle,
        original: { size: media.blob.size, sha256: await hash(media.blob) },
        captureCount: records.filter(
          (record) => record.kind === 'sync-operation' && record.rootKey === rootKey
        ).length,
        pendingCount: records.filter(
          (record) => record.kind === 'pending-checkpoint' && record.rootKey === rootKey
        ).length,
      };
    },
    async seedScenario(bytes: number[], options: unknown = {}) {
      await requireCheckpointFixtureProfile();
      check(
        isRecord(options) &&
          Object.keys(options).every((key) => key === 'savedHtml' || key === 'name') &&
          (options['savedHtml'] === undefined || typeof options['savedHtml'] === 'boolean') &&
          (options['name'] === undefined ||
            (typeof options['name'] === 'string' &&
              options['name'].trim().length > 0 &&
              options['name'].length <= 160 &&
              Array.from(options['name']).every((character) => {
                const code = character.charCodeAt(0);
                return code >= 32 && code !== 127;
              }))),
        'Invalid Scenario fixture options.'
      );
      check(
        Array.isArray(bytes) &&
          bytes.length > 8 &&
          bytes.length <= 1024 * 1024 &&
          bytes.every((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255),
        'Invalid Scenario fixture image.'
      );
      const project = createGuideProject(
        typeof options['name'] === 'string' ? options['name'] : 'Checkpoint Scenario'
      );
      const { assetEntry } = await createScenarioAssetEntryFromBlob({
        blob: new Blob([Uint8Array.from(bytes)], { type: 'image/png' }),
        projectId: project.id,
      });
      const step = createGuideStep('Checkpoint step', 'checkpoint-step');
      step.blocks = [
        {
          id: 'checkpoint-text',
          kind: 'text',
          paragraphs: createGuideParagraphs('Initial checkpoint explanation'),
        },
        createGuideImageBlock({
          id: 'checkpoint-image',
          assetId: assetEntry.id,
          width: assetEntry.width,
          height: assetEntry.height,
          source: { kind: 'import', filename: 'checkpoint.png' },
        }),
      ];
      project.items = [step];
      await commitScenarioAggregateMutation(project, {
        expectedRevision: null,
        storageClass: 'library',
        children: { assetPuts: [assetEntry] },
      });
      const artifacts = [];
      if (options['savedHtml'] === true) {
        for (const edition of [1, 2]) {
          const html = new Blob(
            [
              `<!doctype html><html lang="en"><title>Historical edition ${edition}</title>` +
                `<main>Immutable historical explanation ${edition}. ` +
                'This text does not occur in the current Scenario.' +
                `${options['name'] === undefined ? '' : ` Fixture ${project.id}.`}</main></html>`,
            ],
            { type: 'text/html;charset=utf-8' }
          );
          const capture = await createScenarioHtmlCapture();
          await capture.append(new Uint8Array(await html.arrayBuffer()));
          const { ref } = await capture.finalize();
          const filename = `historical-edition-${edition}.html`;
          const entry = await saveScenarioExportRecord({
            projectId: project.id,
            filename,
            format: 'html',
            size: html.size,
            html: { mode: 'guide', ref },
          });
          artifacts.push({
            exportId: entry.id,
            filename,
            size: html.size,
            sha256: await hash(html),
            assetId: ref.assetId,
          });
        }
      }
      return {
        projectId: project.id,
        stepId: step.id,
        root: { rootKind: 'scenario-project' as const, rootId: project.id },
        artifacts,
      };
    },
    async mediaId(filename: string) {
      check(
        typeof filename === 'string' && filename.length > 0 && filename.length <= 256,
        'Invalid fixture filename.'
      );
      const db = await initDB();
      const matches = (await db.getAll(stores.MEDIA_LIBRARY_STORE)).flatMap((raw) => {
        const media = parseMediaLibraryEntry(raw);
        return media?.filename === filename ? [media.id] : [];
      });
      check(matches.length === 1, 'Fixture media identity is ambiguous or unavailable.');
      return matches[0]!;
    },
    async artifacts(projectId: string) {
      check(
        typeof projectId === 'string' && projectId.length > 0 && projectId.length <= 256,
        'Invalid fixture project.'
      );
      const db = await initDB();
      const entries = (await db.getAll(stores.SCENARIO_EXPORTS_STORE)).flatMap((raw) => {
        const entry = parseScenarioExportEntry(raw);
        return entry?.projectId === projectId && entry.html ? [entry] : [];
      });
      return Promise.all(
        entries.map(async (entry) => {
          check(entry.html, 'Fixture HTML descriptor is unavailable.');
          const ref = parseAssetRef(await db.get(stores.ASSET_REFS_STORE, entry.html.assetId));
          check(
            ref &&
              ref.assetId === entry.html.assetId &&
              ref.size === entry.size &&
              /^text\/html(?:;charset=utf-8)?$/iu.test(ref.mimeType),
            'Fixture HTML body reference is unavailable.'
          );
          const owner = parseAssetOwner(
            await db.get(stores.ASSET_OWNERS_STORE, ['scenario-export', entry.id, 'body'])
          );
          check(
            owner &&
              owner.ownerKind === 'scenario-export' &&
              owner.ownerId === entry.id &&
              owner.role === 'body' &&
              owner.assetId === ref.assetId,
            'Fixture HTML ownership is unavailable.'
          );
          const descriptor = {
            exportId: entry.id,
            filename: entry.filename,
            size: entry.size,
            assetId: ref.assetId,
            objectKey: ref.location.objectKey,
          };
          try {
            await readAssetFile(ref, entry.filename);
          } catch (error) {
            if (
              !(error instanceof MissingAssetObjectError) &&
              !(error instanceof DOMException && error.name === 'NotFoundError')
            )
              throw error;
            return { ...descriptor, resident: false, sha256: null };
          }
          const saved = await readScenarioHtmlArtifact(entry.id);
          check(saved, 'Fixture HTML ownership is unavailable.');
          return { ...descriptor, resident: true, sha256: await hash(saved.blob) };
        })
      );
    },
    async proof(input: unknown) {
      const root = checkedRoot(input);
      const scope = await requireCheckpointFixtureProfile();
      const db = await initDB();
      const state = await logicalState(root);
      const rootKey = JSON.stringify([scope.spaceId, root.rootKind, root.rootId]);
      const records = (await db.getAll(stores.SYNC_CAPTURE_STORE)).flatMap((raw) => {
        const record = parseSyncCaptureRecord(raw);
        check(record, 'Invalid native capture fixture metadata.');
        return record.spaceId === scope.spaceId ? [record] : [];
      });
      const captures = records.flatMap((record) =>
        record.kind === 'sync-operation' && record.rootKey === rootKey
          ? [
              {
                operationId: record.operationId,
                generation: record.generation,
                phase: record.phase,
                sourceSha256: record.sourceSha256,
              },
            ]
          : []
      );
      const publishedObjects = records.flatMap((record) =>
        record.kind === 'sync-operation' &&
        record.phase === 'published' &&
        record.rootKey === rootKey &&
        sameConnectionScope(record, scope)
          ? record.objects.map((object) => ({
              assetId: object.ref.assetId,
              objectKey: object.ref.location.objectKey,
              size: object.ref.size,
              sha256: object.sha256,
              pinned: object.pinned,
            }))
          : []
      );
      const pending = records.flatMap((record) =>
        record.kind === 'pending-checkpoint' && record.rootKey === rootKey
          ? [
              {
                revision: record.revision,
                dueAt: record.dueAt,
                flushRequested: record.flushRequested ?? false,
              },
            ]
          : []
      );
      const queue = (await db.getAll(stores.SYNC_OUTBOX_STORE)).flatMap((raw) => {
        const operation = parseSyncQueueOperation(raw);
        return operation?.rootKey === rootKey && operation.spaceId === scope.spaceId
          ? [
              {
                operationId: operation.operationId,
                status: operation.status,
                revision: operation.revision,
                stage: operation.stage,
                failureCode: operation.failureCode,
                automaticRetryCount: operation.automaticRetryCount,
                nextDueAt: operation.nextDueAt,
              },
            ]
          : [];
      });
      const tx = db.transaction([...NATIVE_EDITING_RESOURCE_STORES], 'readonly');
      const resources = await collectNativeEditingResources(tx, root);
      const inline = await Promise.all(
        resources.inlineMediaIds.map(async (id) => {
          const media = parseMediaLibraryEntry(
            await tx.objectStore(stores.MEDIA_LIBRARY_STORE).get(id)
          );
          check(media?.blob, 'Inline fixture original is unavailable.');
          return { id, blob: media.blob };
        })
      );
      await tx.done;
      const objects = await Promise.all(
        resources.refs.map(async (ref) => {
          const file = await readAssetFile(ref, 'checkpoint-original');
          return {
            assetId: ref.assetId,
            objectKey: ref.location.kind === 'opfs' ? ref.location.objectKey : null,
            size: file.size,
            sha256: await hash(file),
          };
        })
      );
      for (const item of inline)
        objects.push({
          assetId: item.id,
          objectKey: null,
          size: item.blob.size,
          sha256: await hash(item.blob),
        });
      const distinct = new Map(
        objects.map((object) => [object.objectKey ?? `inline:${object.assetId}`, object])
      );
      return {
        root,
        scope,
        ...state,
        logicalSha256: await hash(new Blob([JSON.stringify(state.logical)])),
        captures,
        publishedObjects,
        pending,
        queue,
        allOperations: records.flatMap((record) =>
          record.kind === 'sync-operation'
            ? [{ rootKey: record.rootKey, operationId: record.operationId, phase: record.phase }]
            : []
        ),
        objects,
        physicalScope: 'native-editing-closure' as const,
        physicalObjects: distinct.size,
        physicalBytes: [...distinct.values()].reduce((sum, object) => sum + object.size, 0),
      };
    },
  };
}
