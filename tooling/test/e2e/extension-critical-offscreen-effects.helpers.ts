import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { expect, type Page } from '@playwright/test';
import type { ProjectExportInputReference } from '../../../apps/extension/src/contracts/video/types/messages.export';
import { createEmptyVideoProject } from '../../../apps/extension/src/features/video/project/factories/creation';
import {
  createEffectHostClip,
  createTextClip,
} from '../../../apps/extension/src/features/video/project/factories/overlay-clip';
import {
  VideoExportFormat,
  VideoExportQualityPreset,
  VideoExportScope,
  VideoMp4Codec,
  VideoTrackKind,
  type VideoProject,
} from '../../../apps/extension/src/features/video/project/types';
import type {
  EffectV1Document,
  EffectV1Kind,
} from '../../../packages/runtime-contracts/src/effect-v1/model/types';
import { parseEffectV1Source } from '../../../packages/runtime-contracts/src/effect-v1/validation/index';
import {
  emitTrustedOffscreenHarnessRuntimeMessage,
  getRuntimeMessagesByType,
  VideoMessageType,
} from './extension-critical.helpers';

type OffscreenHarnessBridge = {
  stageProjectExportInput: (
    jobId: string,
    project: VideoProject
  ) => Promise<ProjectExportInputReference>;
};
type EffectSnapshot = NonNullable<VideoProject['effectSnapshots']>[number];
type SerializableEffectSnapshot = Omit<EffectSnapshot, 'assets'> & {
  assets: Array<Omit<EffectSnapshot['assets'][number], 'blob'> & { blob: Blob | null }>;
};
type SerializableEffectProject = Omit<VideoProject, 'effectSnapshots'> & {
  effectSnapshots?: SerializableEffectSnapshot[];
};
const TARGET_EFFECT_SOURCE = readFileSync(
  new URL('./fixtures/effect-v1/demo-target-overlay.sniptale-effect.json', import.meta.url),
  'utf8'
);
const STANDALONE_EFFECT_SOURCE = readFileSync(
  new URL(
    '../../../packages/runtime-contracts/src/effect-v1/fixtures/valid/neutral-runtime-conformance.sniptale-effect.json',
    import.meta.url
  ),
  'utf8'
);
const STANDALONE_ASSET_SOURCE = readFileSync(
  new URL('./fixtures/effect-v1/assets/neutral-mark.svg', import.meta.url),
  'utf8'
);
const TARGET_DOCUMENT = parseFixtureDocument(TARGET_EFFECT_SOURCE, 'targetEffect');
const STANDALONE_DOCUMENT = parseFixtureDocument(STANDALONE_EFFECT_SOURCE, 'standalone');

function parseFixtureDocument(source: string, expectedKind: EffectV1Kind): EffectV1Document {
  const result = parseEffectV1Source(source);
  if (!result.ok || !result.document || result.document.kind !== expectedKind) {
    throw new Error(`Invalid ${expectedKind} EffectV1 E2E fixture`);
  }
  return result.document;
}

export async function renderEffectV1Mp4Projects(page: Page): Promise<void> {
  await renderEffectMp4Project(page, 'effect-v1-target-mp4-e2e', createTargetEffectExportProject());
  await renderEffectMp4Project(
    page,
    'effect-v1-standalone-mp4-e2e',
    createStandaloneEffectExportProject(),
    STANDALONE_ASSET_SOURCE
  );
}

async function renderEffectMp4Project(
  page: Page,
  jobId: string,
  project: SerializableEffectProject,
  assetSource?: string
): Promise<void> {
  const input = await stageEffectExportInput(page, jobId, project, assetSource);
  await emitTrustedOffscreenHarnessRuntimeMessage(page, {
    input,
    jobId,
    settings: {
      burnInSubtitles: false,
      downloadAfterExport: false,
      format: VideoExportFormat.MP4,
      fps: 1,
      height: 90,
      mp4VideoCodec: VideoMp4Codec.VP9,
      quality: VideoExportQualityPreset.BALANCED,
      scope: VideoExportScope.PROJECT,
      subtitleSidecarFormats: [],
      width: 160,
    },
    type: VideoMessageType.OFFSCREEN_START_PROJECT_EXPORT,
  });
  await expectEffectExportCompleted(page, jobId);
}

async function stageEffectExportInput(
  page: Page,
  jobId: string,
  project: SerializableEffectProject,
  assetSource?: string
) {
  return page.evaluate(
    async ({ nextAssetSource, nextJobId, nextProject }) => {
      const bridge = (window as Window & { __sniptaleOffscreenHarness?: OffscreenHarnessBridge })
        .__sniptaleOffscreenHarness;
      if (!bridge) throw new Error('Offscreen harness bridge unavailable');
      const effectSnapshots = nextProject.effectSnapshots?.map((snapshot) => ({
        ...snapshot,
        assets: snapshot.assets.map((asset) => {
          if (asset.blob) return asset;
          if (nextAssetSource === undefined) {
            throw new Error('EffectV1 asset bytes unavailable');
          }
          return { ...asset, blob: new Blob([nextAssetSource], { type: asset.mimeType }) };
        }),
      }));
      const hydratedProject: VideoProject = {
        ...nextProject,
        ...(effectSnapshots ? { effectSnapshots } : {}),
      };
      return bridge.stageProjectExportInput(nextJobId, hydratedProject);
    },
    { nextAssetSource: assetSource, nextJobId: jobId, nextProject: project }
  );
}

async function expectEffectExportCompleted(page: Page, jobId: string): Promise<void> {
  await expect
    .poll(
      async () => {
        const completed = await getRuntimeMessagesByType(
          page,
          VideoMessageType.PROJECT_EXPORT_COMPLETED
        );
        const failed = await getRuntimeMessagesByType(page, VideoMessageType.PROJECT_EXPORT_FAILED);
        return {
          completed: completed.some((message) => message.jobId === jobId),
          failed: failed.filter((message) => message.jobId === jobId),
        };
      },
      { timeout: 30_000 }
    )
    .toEqual({ completed: true, failed: [] });
}

function createTargetEffectExportProject(): VideoProject {
  const project = createEmptyVideoProject('EffectV1 MP4 E2E', 160, 90);
  const track = project.tracks.find(({ kind }) => kind === VideoTrackKind.OVERLAY);
  if (!track) throw new Error('Overlay track unavailable');
  const clip = {
    ...createTextClip(track.id, project.width, project.height, 0),
    duration: 1,
    id: 'effect-v1-mp4-target',
  };
  const sha256 = createHash('sha256').update(TARGET_EFFECT_SOURCE).digest('hex');
  const snapshotId = `effect:${sha256}`;
  return {
    ...project,
    clips: [clip],
    duration: 1,
    effectInstances: [
      {
        controls: getDefaultControls(TARGET_DOCUMENT),
        duration: 1,
        enabled: true,
        id: 'effect-v1-mp4-instance',
        kind: TARGET_DOCUMENT.kind,
        playbackRate: TARGET_DOCUMENT.duration,
        snapshotId,
        startTime: 0,
        target: { clipId: clip.id, kind: 'clip' },
      },
    ],
    effectSnapshots: [
      createSnapshot(TARGET_DOCUMENT, snapshotId, sha256, TARGET_EFFECT_SOURCE, []),
    ],
  };
}

function createStandaloneEffectExportProject(): SerializableEffectProject {
  const project = createEmptyVideoProject('Standalone EffectV1 MP4 E2E', 160, 90);
  const track = project.tracks.find(({ kind }) => kind === VideoTrackKind.OVERLAY);
  if (!track) throw new Error('Overlay track unavailable');
  const instanceId = 'effect-v1-standalone-mp4-instance';
  const sha256 = createHash('sha256').update(STANDALONE_EFFECT_SOURCE).digest('hex');
  const snapshotId = `effect:${sha256}`;
  return {
    ...project,
    clips: [
      createEffectHostClip({
        duration: 1,
        effectInstanceId: instanceId,
        name: STANDALONE_DOCUMENT.id,
        projectHeight: project.height,
        projectWidth: project.width,
        startTime: 0,
        trackId: track.id,
      }),
    ],
    duration: 1,
    effectInstances: [
      {
        controls: getDefaultControls(STANDALONE_DOCUMENT),
        duration: 1,
        enabled: true,
        id: instanceId,
        kind: STANDALONE_DOCUMENT.kind,
        playbackRate: STANDALONE_DOCUMENT.duration,
        snapshotId,
        startTime: 0,
        target: { kind: 'scene' },
      },
    ],
    effectSnapshots: [createStandaloneSnapshot(snapshotId, sha256)],
  };
}

function createStandaloneSnapshot(snapshotId: string, sha256: string): SerializableEffectSnapshot {
  const declaredAsset = STANDALONE_DOCUMENT.assets[0];
  if (
    !declaredAsset ||
    declaredAsset.kind !== 'svg' ||
    declaredAsset.byteLength === undefined ||
    declaredAsset.sha256 === undefined
  ) {
    throw new Error('Standalone EffectV1 asset unavailable');
  }
  const assets = [{ ...declaredAsset, blob: null }];
  const retainedByteLength =
    new TextEncoder().encode(STANDALONE_EFFECT_SOURCE).byteLength + declaredAsset.byteLength;
  return createSnapshot(
    STANDALONE_DOCUMENT,
    snapshotId,
    sha256,
    STANDALONE_EFFECT_SOURCE,
    assets,
    retainedByteLength
  );
}

function createSnapshot(
  document: EffectV1Document,
  id: string,
  sha256: string,
  source: string,
  assets: SerializableEffectSnapshot['assets'],
  retainedByteLength = new TextEncoder().encode(source).byteLength
): SerializableEffectSnapshot {
  return {
    assets,
    documentId: document.id,
    id,
    kind: document.kind,
    retainedByteLength,
    schemaVersion: 'sniptale.effect.v1',
    sha256,
    source,
  };
}

function getDefaultControls(document: EffectV1Document) {
  return Object.fromEntries(document.controls.map(({ defaultValue, id }) => [id, defaultValue]));
}
