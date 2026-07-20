import { readFileSync } from 'node:fs';

import type { EffectV1Document } from '@sniptale/runtime-contracts/effect-v1';
import { createEmptyVideoProject } from '../../../project/factories/creation';
import { createEffectHostClip } from '../../../project/factories/overlay-clip';
import {
  VideoClipLinkMode,
  VideoMediaFitMode,
  VideoProjectClipType,
  VideoTransitionEasing,
  VideoTransitionKind,
  type VideoProject,
} from '../../../project/types/index';

const FIXTURE_ROOT =
  '../../../../../../../../packages/runtime-contracts/src/effect-v1/fixtures/valid/';
const AUDIO_SHA = '0'.repeat(64);

export function createAudioProject(): VideoProject {
  const document = createAudioDocument();
  const project = createEmptyVideoProject('Effect audio');
  project.duration = 10;
  project.effectSnapshots = [createAudioSnapshot(document)];
  project.effectInstances = [
    {
      controls: {},
      duration: 1.5,
      enabled: true,
      id: 'effect-1',
      kind: 'standalone',
      playbackRate: 2,
      snapshotId: 'snapshot-1',
      startTime: 2,
      target: { kind: 'scene' },
    },
  ];
  const overlayTrack = project.tracks.find(({ kind }) => kind === 'OVERLAY')!;
  project.clips = [
    createEffectHostClip({
      duration: 1.5,
      effectInstanceId: 'effect-1',
      name: 'Effect audio host',
      projectHeight: project.height,
      projectWidth: project.width,
      startTime: 2,
      trackId: overlayTrack.id,
    }),
  ];
  return project;
}

export function convertToTargetEffect(project: VideoProject): void {
  const snapshot = project.effectSnapshots![0]!;
  const document = readEffectFixture('neutral-target-effect.sniptale-effect.json');
  appendAudioLayer(document);
  snapshot.documentId = document.id;
  snapshot.kind = 'targetEffect';
  snapshot.source = JSON.stringify(document);
  const trackId = project.tracks[0]!.id;
  project.tracks[0]!.visible = true;
  project.clips = [createTargetClip(trackId)];
  Object.assign(project.effectInstances![0]!, {
    duration: document.duration / project.effectInstances![0]!.playbackRate,
    kind: 'targetEffect',
    target: { clipId: 'target-clip', kind: 'clip' },
  });
}

export function convertToTransitionEffect(project: VideoProject): void {
  const snapshot = project.effectSnapshots![0]!;
  const document = readEffectFixture('neutral-transition.sniptale-effect.json');
  appendAudioLayer(document);
  snapshot.documentId = document.id;
  snapshot.kind = 'transition';
  snapshot.source = JSON.stringify(document);
  const trackId = project.tracks[0]!.id;
  const leading = { ...createTargetClip(trackId), duration: 2, id: 'leading-clip' };
  const trailing = {
    ...createTargetClip(trackId),
    duration: 2,
    id: 'trailing-clip',
    startTime: 1,
  };
  project.clips = [leading, trailing];
  project.transitions = [
    {
      duration: 1,
      easing: VideoTransitionEasing.LINEAR,
      id: 'effect-transition',
      kind: VideoTransitionKind.CROSSFADE,
      leadingClipId: leading.id,
      trailingClipId: trailing.id,
    },
  ];
  Object.assign(project.effectInstances![0]!, {
    duration: 1,
    kind: 'transition',
    playbackRate: document.duration,
    startTime: 1,
    target: { kind: 'transition', transitionId: 'effect-transition' },
  });
}

export function updateDocument(
  project: VideoProject,
  update: (document: EffectV1Document) => void
): void {
  const snapshot = project.effectSnapshots![0]!;
  const document = JSON.parse(snapshot.source) as EffectV1Document;
  update(document);
  snapshot.source = JSON.stringify(document);
}

export function restoreValidAudioSnapshot(project: VideoProject): void {
  project.effectSnapshots![0] = createAudioSnapshot(createAudioDocument());
}

function createTargetClip(trackId: string): VideoProject['clips'][number] {
  return {
    assetId: 'asset',
    duration: 2,
    fadeInMs: 0,
    fadeOutMs: 0,
    fitMode: VideoMediaFitMode.CONTAIN,
    groupId: null,
    id: 'target-clip',
    linkMode: VideoClipLinkMode.DETACHED,
    muted: false,
    name: 'Target',
    startTime: 0,
    trackId,
    transform: { height: 10, opacity: 1, rotation: 0, width: 10, x: 0, y: 0 },
    transitionIn: 'NONE',
    transitionOut: 'NONE',
    type: VideoProjectClipType.IMAGE,
    volume: 1,
  };
}

function createAudioDocument(): EffectV1Document {
  const document = readEffectFixture('neutral-standalone.sniptale-effect.json');
  appendAudioLayer(document);
  return document;
}

function appendAudioLayer(document: EffectV1Document): void {
  document.assets.push({
    byteLength: 4,
    id: 'tone',
    kind: 'audio',
    mimeType: 'audio/wav',
    path: 'assets/tone.wav',
    sha256: AUDIO_SHA,
  });
  document.layers.push({
    assetId: 'tone',
    id: 'audio',
    name: 'Audio',
    type: 'audio',
    volume: 0.4,
  });
  document.clips.push({
    duration: 1,
    layerId: 'audio',
    offset: 0.25,
    sceneId: 'main',
    start: 0.5,
  });
}

function createAudioSnapshot(
  document: EffectV1Document
): NonNullable<VideoProject['effectSnapshots']>[number] {
  return {
    assets: [
      {
        blob: new Blob(['tone'], { type: 'audio/wav' }),
        byteLength: 4,
        id: 'tone',
        kind: 'audio',
        mimeType: 'audio/wav',
        sha256: AUDIO_SHA,
      },
    ],
    documentId: document.id,
    id: 'snapshot-1',
    kind: document.kind,
    retainedByteLength: 4,
    schemaVersion: 'sniptale.effect.v1',
    sha256: '1'.repeat(64),
    source: JSON.stringify(document),
  };
}

function readEffectFixture(filename: string): EffectV1Document {
  return JSON.parse(
    readFileSync(new URL(`${FIXTURE_ROOT}${filename}`, import.meta.url), 'utf8')
  ) as EffectV1Document;
}
