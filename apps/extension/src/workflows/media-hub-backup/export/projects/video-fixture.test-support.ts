import {
  VideoProjectAssetType,
  VideoTimelinePlacementMode,
  type VideoProject,
} from '../../../../features/video/project/types';
import { createEmptyVideoProject } from '../../../../features/video/project/factories/creation';
import { createEffectHostClip } from '../../../../features/video/project/factories/overlay-clip';
import { readFileSync } from 'node:fs';
import { sha256EffectV1Bytes, type EffectV1Document } from '@sniptale/runtime-contracts/effect-v1';

export function createVideoProjectFixture(
  id: string,
  assets: Array<{ source: { kind: 'project-asset'; projectAssetId: string } }> = []
): VideoProject {
  const projectAssets = assets.map((asset, index) => ({
    createdAt: 1,
    id: asset.source.projectAssetId,
    metadata: {
      audioPeaks: null,
      duration: 1,
      hasAudio: false,
      height: 10,
      mimeType: 'image/png',
      size: 5,
      width: 10,
    },
    name: `Asset ${index + 1}`,
    source: asset.source,
    type: VideoProjectAssetType.IMAGE,
  }));

  return {
    actionEvents: [],
    assets: projectAssets,
    backgroundColor: '#ffffff',
    baseRecordingId: null,
    clips: [],
    createdAt: 1,
    cursorTrack: null,
    duration: 1,
    fps: 30,
    height: 720,
    id,
    name: 'Video',
    source: { kind: 'manual' },
    timelinePlacementMode: VideoTimelinePlacementMode.RIPPLE_PUSH,
    tracks: [],
    updatedAt: 2,
    version: 2,
    width: 1280,
  };
}

export async function createEffectVideoProjectFixture(id: string): Promise<VideoProject> {
  const project = {
    ...createEmptyVideoProject('Video', 1280, 720),
    createdAt: 1,
    id,
    updatedAt: 2,
  };
  const document = readEffectFixture();
  const assetBytes = new TextEncoder().encode(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0h10v10H0z"/></svg>'
  );
  const assetSha = await sha256EffectV1Bytes(assetBytes);
  document.assets.push({
    byteLength: assetBytes.byteLength,
    id: 'mark',
    kind: 'svg',
    mimeType: 'image/svg+xml',
    path: 'assets/mark.svg',
    sha256: assetSha,
  });
  document.layers.push({
    assetId: 'mark',
    height: 10,
    id: 'mark-layer',
    type: 'svgAsset',
    width: 10,
  });
  document.clips.push({ duration: document.duration, layerId: 'mark-layer', start: 0 });
  const source = JSON.stringify(document);
  const sourceBytes = new TextEncoder().encode(source);
  const sourceSha = await sha256EffectV1Bytes(sourceBytes);
  const instance = createEffectInstance(document, sourceSha);
  return {
    ...project,
    clips: [createEffectFixtureHost(project, instance)],
    duration: instance.duration,
    effectInstances: [instance],
    effectSnapshots: [
      createEffectSnapshot(document, source, sourceBytes, sourceSha, assetBytes, assetSha),
    ],
  };
}

function createEffectFixtureHost(
  project: VideoProject,
  instance: NonNullable<VideoProject['effectInstances']>[number]
) {
  const overlayTrack = project.tracks.find(({ kind }) => kind === 'OVERLAY');
  if (!overlayTrack) throw new Error('Expected an overlay track for the EffectV1 fixture.');
  return createEffectHostClip({
    duration: instance.duration,
    effectInstanceId: instance.id,
    name: 'EffectV1 fixture',
    projectHeight: project.height,
    projectWidth: project.width,
    startTime: instance.startTime,
    trackId: overlayTrack.id,
  });
}

function readEffectFixture(): EffectV1Document {
  return JSON.parse(
    readFileSync(
      new URL(
        '../../../../../../../packages/runtime-contracts/src/effect-v1/fixtures/valid/' +
          'neutral-standalone.sniptale-effect.json',
        import.meta.url
      ),
      'utf8'
    )
  ) as EffectV1Document;
}

function createEffectInstance(
  document: EffectV1Document,
  sourceSha: string
): NonNullable<VideoProject['effectInstances']>[number] {
  return {
    controls: Object.fromEntries(
      document.controls.map(({ defaultValue, id }) => [id, defaultValue])
    ),
    duration: document.duration,
    enabled: true,
    id: 'effect-instance-1',
    kind: 'standalone',
    playbackRate: 1,
    snapshotId: `effect:${sourceSha}`,
    startTime: 0,
    target: { kind: 'scene' },
  };
}

function createEffectSnapshot(
  document: EffectV1Document,
  source: string,
  sourceBytes: Uint8Array,
  sourceSha: string,
  assetBytes: Uint8Array<ArrayBuffer>,
  assetSha: string
): NonNullable<VideoProject['effectSnapshots']>[number] {
  return {
    assets: [
      {
        blob: new Blob([assetBytes], { type: 'image/svg+xml' }),
        byteLength: assetBytes.byteLength,
        id: 'mark',
        kind: 'svg',
        mimeType: 'image/svg+xml',
        sha256: assetSha,
      },
    ],
    documentId: document.id,
    id: `effect:${sourceSha}`,
    kind: 'standalone',
    retainedByteLength: sourceBytes.byteLength + assetBytes.byteLength,
    schemaVersion: 'sniptale.effect.v1',
    sha256: sourceSha,
    source,
  };
}
