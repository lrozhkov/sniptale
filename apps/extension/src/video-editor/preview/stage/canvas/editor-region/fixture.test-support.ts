import { readFileSync } from 'node:fs';
import { parseEffectV1Source } from '@sniptale/runtime-contracts/effect-v1';
import { createEmptyVideoProject } from '../../../../../features/video/project/factories/creation';
import { createVideoClip } from '../../../../../features/video/project/timeline/project-meta.test.helpers';
const sourceText = readFileSync(
  'packages/runtime-contracts/src/effect-v1/fixtures/collection/sniptale-spotlight.sniptale-effect.json',
  'utf8'
);
export function projectFixture() {
  const project = createEmptyVideoProject('Region', 1280, 720);
  const clip = createVideoClip({
    id: 'video',
    trackId: project.tracks[0]!.id,
    startTime: 0,
    duration: 5,
  });
  clip.transform = { ...clip.transform, x: 150, y: 90, width: 800, height: 450, rotation: 30 };
  project.clips = [clip];
  project.duration = 5;
  const text = sourceText;
  const document = parseEffectV1Source(text).document!;
  project.effectSnapshots = [
    {
      id: 'snapshot',
      sha256: '1'.repeat(64),
      source: text,
      assets: [],
      retainedByteLength: text.length,
      schemaVersion: 'sniptale.effect.v1',
      documentId: document.id,
      kind: 'targetEffect',
    },
  ];
  project.effectInstances = [
    {
      id: 'fx',
      kind: 'targetEffect',
      target: { kind: 'clip', clipId: clip.id },
      snapshotId: 'snapshot',
      controls: {},
      enabled: true,
      startTime: 0,
      duration: 5,
      playbackRate: 0.8,
    },
  ];
  return project;
}
