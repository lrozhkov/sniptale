import { readFileSync } from 'node:fs';

import {
  sha256EffectV1Bytes,
  validateEffectV1Document,
  type EffectV1Document,
} from '@sniptale/runtime-contracts/effect-v1';

import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import { createEffectHostClip } from '../../../features/video/project/factories/overlay-clip';
import type { VideoProject } from '../../../features/video/project/types/model';

interface LargeEffectFixture {
  assetSha256: string;
  blob: Blob;
  declaredAsset: EffectV1Document['assets'][number];
  document: EffectV1Document;
  documentSha256: string;
  documentSource: string;
}

export async function createLargeEffectProject(): Promise<VideoProject> {
  const fixture = await createLargeEffectFixture();
  const project = createEmptyVideoProject('Large EffectV1 export', 1280, 720);
  project.id = 'project-1';
  const overlayTrack = project.tracks.find(({ kind }) => kind === 'OVERLAY');
  if (!overlayTrack) throw new Error('Expected overlay track');
  return {
    ...project,
    clips: [createHostClip(project, overlayTrack.id, fixture.document.duration)],
    duration: fixture.document.duration,
    effectInstances: [createInstance(fixture)],
    effectSnapshots: [createSnapshot(fixture)],
  };
}

async function createLargeEffectFixture(): Promise<LargeEffectFixture> {
  const source = readFileSync(
    new URL(
      '../../../../../../packages/runtime-contracts/src/effect-v1/fixtures/valid/' +
        'neutral-runtime-conformance.sniptale-effect.json',
      import.meta.url
    ),
    'utf8'
  );
  const parsed = validateEffectV1Document(JSON.parse(source));
  if (!parsed.ok || !parsed.document) throw new Error('Expected valid EffectV1 fixture');
  const svgSource = `<svg xmlns="http://www.w3.org/2000/svg">${' '.repeat(2 * 1024 * 1024)}</svg>`;
  const blob = new Blob([svgSource], { type: 'image/svg+xml' });
  const assetSha256 = await sha256EffectV1Bytes(new Uint8Array(await blob.arrayBuffer()));
  const declaredAsset = parsed.document.assets[0];
  if (!declaredAsset) throw new Error('Expected fixture asset');
  const document = {
    ...parsed.document,
    assets: [{ ...declaredAsset, byteLength: blob.size, sha256: assetSha256 }],
  };
  const documentSource = JSON.stringify(document);
  const documentSha256 = await sha256EffectV1Bytes(new TextEncoder().encode(documentSource));
  return { assetSha256, blob, declaredAsset, document, documentSha256, documentSource };
}

function createHostClip(project: VideoProject, trackId: string, duration: number) {
  return createEffectHostClip({
    duration,
    effectInstanceId: 'effect-instance-1',
    name: 'Large effect',
    projectHeight: project.height,
    projectWidth: project.width,
    startTime: 0,
    trackId,
  });
}

function createSnapshot(fixture: LargeEffectFixture) {
  return {
    assets: [
      {
        blob: fixture.blob,
        byteLength: fixture.blob.size,
        id: fixture.declaredAsset.id,
        kind: 'svg' as const,
        mimeType: 'image/svg+xml',
        sha256: fixture.assetSha256,
      },
    ],
    documentId: fixture.document.id,
    id: `effect:${fixture.documentSha256}`,
    kind: fixture.document.kind,
    retainedByteLength:
      new TextEncoder().encode(fixture.documentSource).byteLength + fixture.blob.size,
    schemaVersion: 'sniptale.effect.v1' as const,
    sha256: fixture.documentSha256,
    source: fixture.documentSource,
  };
}

function createInstance(fixture: LargeEffectFixture) {
  return {
    controls: {},
    duration: fixture.document.duration,
    enabled: true,
    id: 'effect-instance-1',
    kind: fixture.document.kind,
    playbackRate: 1,
    snapshotId: `effect:${fixture.documentSha256}`,
    startTime: 0,
    target: { kind: 'scene' as const },
  };
}
