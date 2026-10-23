import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { buildEffectThumbnailPlans } from './effect-thumbnail-plans';
import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import { createEffectHostClip } from '../../../features/video/project/factories/overlay-clip';
import { parseEffectV1Source } from '@sniptale/runtime-contracts/effect-v1';

function project() {
  const p = createEmptyVideoProject('thumbnail');
  const source = readFileSync(
    'packages/runtime-contracts/src/effect-v1/fixtures/valid/neutral-standalone.sniptale-effect.json',
    'utf8'
  );
  const d = parseEffectV1Source(source).document!;
  p.clips = [
    createEffectHostClip({
      duration: d.duration,
      effectInstanceId: 'instance',
      name: 'Annotation',
      projectHeight: p.height,
      projectWidth: p.width,
      startTime: 0,
      trackId: p.tracks[0]!.id,
    }),
  ];
  p.effectSnapshots = [
    {
      id: 'snapshot',
      documentId: d.id,
      kind: d.kind,
      schemaVersion: d.schemaVersion,
      sha256: 'a'.repeat(64),
      retainedByteLength: source.length,
      source,
      assets: [],
    },
  ];
  p.effectInstances = [
    {
      id: 'instance',
      snapshotId: 'snapshot',
      kind: 'standalone',
      target: { kind: 'scene' },
      startTime: 0,
      duration: d.duration,
      playbackRate: 1,
      controls: {},
      enabled: true,
    },
  ];
  return p;
}
it('renders a retained representative source frame, preserving its key when moved', () => {
  const p = project();
  const before = buildEffectThumbnailPlans(p, null)[0]!;
  expect(before.plan.time).toBe(1.5);
  expect(before.plan.renderDimensions.width).toBeLessThanOrEqual(160);
  expect(before.plan.renderDimensions.height).toBeLessThanOrEqual(90);
  p.clips[0]!.startTime = 10;
  p.effectInstances![0]!.startTime = 10;
  expect(buildEffectThumbnailPlans(p, null)[0]!.key).toBe(before.key);
  p.effectInstances![0]!.enabled = false;
  p.tracks[0]!.visible = false;
  expect(buildEffectThumbnailPlans(p, null)[0]!.key).toBe(before.key);
});
it('omits offscreen and invalid annotations without crashing the editor', () => {
  const p = project();
  expect(buildEffectThumbnailPlans(null, null)).toEqual([]);
  expect(buildEffectThumbnailPlans(p, { startTime: 10, endTime: 12, pixelsPerSecond: 50 })).toEqual(
    []
  );
  p.effectSnapshots![0]!.source = '{}';
  expect(buildEffectThumbnailPlans(p, null)).toEqual([]);
});

it('retains the video owner when preparing a source-bound annotation thumbnail', async () => {
  const { createVideoProjectFromRecording } =
    await import('../../../features/video/project/factories/creation');
  const p = project();
  const recording = createVideoProjectFromRecording({
    recordingId: 'source',
    filename: 'source.webm',
    width: p.width,
    height: p.height,
    duration: 5,
    size: 1,
    mimeType: 'video/webm',
  });
  const video = recording.clips.find((clip) => clip.type === 'VIDEO');
  const host = p.clips[0];
  if (!video || video.type !== 'VIDEO' || !host || host.type !== 'EFFECT')
    throw new Error('Missing annotation source');
  p.assets = recording.assets;
  p.tracks.push(...recording.tracks);
  p.clips.push(video);
  host.attachment = {
    kind: 'source',
    assetId: video.assetId,
    sourceInstanceId: video.sourceInstanceId ?? video.id,
  };
  host.sourceRange = {
    assetId: video.assetId,
    sourceInstanceId: video.sourceInstanceId ?? video.id,
    start: 0,
    end: 3,
  };
  p.version = 44;
  p.duration = 5;
  const before = structuredClone(p);
  const plans = buildEffectThumbnailPlans(p, null);
  expect(plans).toHaveLength(1);
  expect(plans[0]?.clipId).toBe(host.id);
  expect(plans[0]?.plan.time).toBe(1.5);
  expect(p).toEqual(before);
  for (const track of p.tracks) track.visible = false;
  p.effectInstances![0]!.enabled = false;
  expect(buildEffectThumbnailPlans(p, null)).toHaveLength(1);
});
