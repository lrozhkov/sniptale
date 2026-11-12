import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { parseAnimationTemplateJson } from '@sniptale/runtime-contracts/animation-template';
import {
  createEmptyVideoProject,
  createVideoProjectTrack,
} from '../../../features/video/project/factories/creation';
import { createEffectHostClip } from '../../../features/video/project/factories/overlay-clip';
import { VideoTrackKind, type VideoProject } from '../../../features/video/project/types';

/** Several individually bounded sources exceed the message ceiling without weakening JSON limits. */
export async function createLargeEffectProject(): Promise<VideoProject> {
  const value = JSON.parse(
    readFileSync(
      'apps/extension/public/video-effects/animations/callout.sniptale-animation.json',
      'utf8'
    )
  );
  const project = createEmptyVideoProject('Large Lottie export', 1280, 720);
  const overlay = createVideoProjectTrack('Overlay', 0, VideoTrackKind.PRIMARY);
  project.tracks.push(overlay);
  project.id = 'project-1';
  project.effectInstances = [];
  project.effectSnapshots = [];
  for (let index = 0; index < 9; index++) {
    const source = JSON.stringify({ ...value, id: `large-animation-${index}` });
    const parsed = await parseAnimationTemplateJson(source);
    if (!parsed.ok) throw Error('Invalid large source-only animation fixture');
    const sha256 = createHash('sha256').update(source).digest('hex');
    const snapshotId = `effect:${sha256}`,
      instanceId = `effect-instance-${index}`;
    const duration =
      (parsed.template.animation.op - parsed.template.animation.ip) / parsed.template.animation.fr;
    const startTime = index * duration;
    project.clips.push(
      createEffectHostClip({
        duration,
        effectInstanceId: instanceId,
        name: 'Large animation',
        projectHeight: project.height,
        projectWidth: project.width,
        startTime,
        trackId: overlay.id,
      })
    );
    project.effectInstances.push({
      id: instanceId,
      snapshotId,
      kind: 'standalone',
      target: { kind: 'scene' },
      duration,
      startTime,
      playbackRate: 1,
      enabled: true,
      controls: {},
      sceneAnchors: { tip: { x: 640, y: 360 } },
    });
    project.effectSnapshots.push({
      id: snapshotId,
      documentId: parsed.template.id,
      kind: 'standalone',
      schemaVersion: 'sniptale.animation.v1',
      sha256,
      source,
      retainedByteLength: Buffer.byteLength(source),
      assets: [],
    });
    project.duration = startTime + duration;
  }
  return project;
}
