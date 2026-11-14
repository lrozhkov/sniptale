import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { expect, type Page } from '@playwright/test';
import type { ProjectExportInputReference } from '../../../../apps/extension/src/contracts/video/types/messages.export';
import {
  createEmptyVideoProject,
  createVideoProjectTrack,
} from '../../../../apps/extension/src/features/video/project/factories/creation';
import {
  createEffectHostClip,
  createTextClip,
} from '../../../../apps/extension/src/features/video/project/factories/overlay-clip';
import {
  VideoExportFormat,
  VideoExportQualityPreset,
  VideoExportScope,
  VideoMp4Codec,
  VideoTrackKind,
  type VideoProject,
} from '../../../../apps/extension/src/features/video/project/types';
import {
  parseAnimationTemplateSource,
  type AnimationTemplate,
} from '@sniptale/runtime-contracts/animation-template';
import { resolveEffectControlDefault } from '@sniptale/runtime-contracts/effect-controls';
import { initializeEffectSceneAnchors } from '../../../../apps/extension/src/features/video/project/effect-instance/layout';
import { animationRuntimeDuration } from '../../../../apps/extension/src/contracts/effect-runtime/animation';
import {
  emitTrustedOffscreenHarnessRuntimeMessage,
  getRuntimeMessagesByType,
  VideoMessageType,
} from '../extension-critical.helpers';

type OffscreenHarnessBridge = {
  stageProjectExportInput: (
    jobId: string,
    project: VideoProject
  ) => Promise<ProjectExportInputReference>;
};
type EffectSnapshot = NonNullable<VideoProject['effectSnapshots']>[number];
const LOTTIE_SOURCES = ['title', 'callout'].map((name) =>
  readFileSync(
    new URL(
      name === 'callout'
        ? '../../../../apps/extension/src/features/video/project/effect-bundle/' +
            'fixtures/retained/callout.sniptale-animation.json'
        : `../../../../apps/extension/public/video-effects/animations/${name}.sniptale-animation.json`,
      import.meta.url
    ),
    'utf8'
  )
);
function parseFixtureDocument(source: string): AnimationTemplate {
  const result = parseAnimationTemplateSource(source);
  if (!result.template) throw new Error('Invalid Lottie E2E fixture.');
  return result.template;
}

export async function renderLottieMp4Projects(page: Page): Promise<void> {
  for (const [index, source] of LOTTIE_SOURCES.entries()) {
    await renderEffectMp4Project(
      page,
      `lottie-mp4-e2e-${index}`,
      createLottieExportProject(source, index === 0)
    );
  }
}

async function renderEffectMp4Project(
  page: Page,
  jobId: string,
  project: VideoProject
): Promise<void> {
  const input = await stageEffectExportInput(page, jobId, project);
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
      quality: VideoExportQualityPreset.MEDIUM,
      resolution: 'SOURCE',
      scope: VideoExportScope.PROJECT,
      subtitleSidecarFormats: [],
      width: 160,
    },
    type: VideoMessageType.OFFSCREEN_START_PROJECT_EXPORT,
  });
  await expectEffectExportCompleted(page, jobId);
}

async function stageEffectExportInput(page: Page, jobId: string, project: VideoProject) {
  return page.evaluate(
    ({ nextJobId, nextProject }) => {
      const bridge = (window as Window & { __sniptaleOffscreenHarness?: OffscreenHarnessBridge })
        .__sniptaleOffscreenHarness;
      if (!bridge) throw new Error('Offscreen harness bridge unavailable');
      return bridge.stageProjectExportInput(nextJobId, nextProject);
    },
    { nextJobId: jobId, nextProject: project }
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

function createLottieExportProject(source: string, withText: boolean): VideoProject {
  const document = parseFixtureDocument(source);
  const project = createEmptyVideoProject('Lottie MP4 E2E', 160, 90);
  const track = createVideoProjectTrack('Annotations', 0, VideoTrackKind.PRIMARY);
  project.tracks.push(track);
  const instanceId = `lottie-mp4-${document.id}`;
  const sha256 = createHash('sha256').update(source).digest('hex');
  const snapshotId = `effect:${sha256}`;
  if (withText) {
    const textTrack = createVideoProjectTrack('Text', 1, VideoTrackKind.PRIMARY);
    project.tracks.push(textTrack);
    project.clips.push({
      ...createTextClip(textTrack.id, project.width, project.height, 0),
      duration: 1,
    });
  }
  const host = createEffectHostClip({
    dimensions: { width: document.animation.w, height: document.animation.h },
    duration: 1,
    effectInstanceId: instanceId,
    name: document.id,
    projectHeight: project.height,
    projectWidth: project.width,
    startTime: 0,
    trackId: track.id,
  });
  project.clips.push(host);
  const sceneAnchors = initializeEffectSceneAnchors(document, host.transform);
  const controls = Object.fromEntries(
    document.controls.map((control) => [control.id, resolveEffectControlDefault(control, 'en')])
  );
  for (const handle of document.objectLayout?.handles ?? []) {
    delete controls[handle.xControl];
    delete controls[handle.yControl];
  }
  project.duration = 1;
  project.effectInstances = [
    {
      controls,
      duration: 1,
      enabled: true,
      id: instanceId,
      kind: 'standalone',
      playbackRate: animationRuntimeDuration(document),
      snapshotId,
      startTime: 0,
      target: { kind: 'scene' },
      ...(sceneAnchors ? { sceneAnchors } : {}),
    },
  ];
  const snapshot: EffectSnapshot = {
    assets: [],
    documentId: document.id,
    id: snapshotId,
    kind: 'standalone',
    retainedByteLength: new TextEncoder().encode(source).byteLength,
    schemaVersion: 'sniptale.animation.v1',
    sha256,
    source,
  };
  project.effectSnapshots = [snapshot];
  return project;
}
