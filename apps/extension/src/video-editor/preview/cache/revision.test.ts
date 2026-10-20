import { createQuickEditWatermark } from '../../../features/video/project/scene/watermark';
import { videoProjectCaptionInput } from '../../../features/video/project/text/captions';
import { planReviewCaptions } from '../../../features/video/review/caption-plan';
import { createVideoClipFromAsset } from '../../../features/video/project/factories/clip';
import { expect, it } from 'vitest';

import {
  createEmptyVideoProject,
  createVideoProjectAsset,
  createVideoProjectTrack,
} from '../../../features/video/project/factories/creation';
import { createTextClip } from '../../../features/video/project/factories/overlay-clip';
import {
  VideoTrackKind,
  VideoMotionFocusMode,
  VideoProjectActionEventKind,
  VideoProjectActionPreset,
  VideoTemporalEasing,
} from '../../../features/video/project/types';
import { createVideoPreviewRenderRevision, createVideoPreviewSegmentRevision } from './revision';

it('ignores non-render project labels and timestamps but changes for visual state', async () => {
  const project = createEmptyVideoProject('Original', 1920, 1080);
  const revision = await createVideoPreviewRenderRevision(project);
  await expect(
    createVideoPreviewRenderRevision({
      ...project,
      createdAt: project.createdAt + 10,
      name: 'Renamed',
      updatedAt: project.updatedAt + 20,
    })
  ).resolves.toBe(revision);
  await expect(
    createVideoPreviewRenderRevision({ ...project, backgroundColor: '#ff0000' })
  ).resolves.not.toBe(revision);
});

it('invalidates only the segment influenced by a bounded clip edit', async () => {
  const project = { ...createEmptyVideoProject('Segments', 1920, 1080), duration: 4, fps: 10 };
  const overlay = createVideoProjectTrack('Text', 0, VideoTrackKind.PRIMARY);
  project.tracks.push(overlay);
  const trackId = overlay.id;
  const first = { ...createTextClip(trackId, project.width, project.height, 0.2), duration: 1 };
  const second = { ...createTextClip(trackId, project.width, project.height, 2.2), duration: 1 };
  project.clips = [first, second];
  const before = await Promise.all([
    createVideoPreviewSegmentRevision(project, { endFrame: 20, startFrame: 0 }),
    createVideoPreviewSegmentRevision(project, { endFrame: 40, startFrame: 20 }),
  ]);

  project.clips = [first, { ...second, text: 'Changed only in the second segment' }];
  const after = await Promise.all([
    createVideoPreviewSegmentRevision(project, { endFrame: 20, startFrame: 0 }),
    createVideoPreviewSegmentRevision(project, { endFrame: 40, startFrame: 20 }),
  ]);

  expect(after[0]).toBe(before[0]);
  expect(after[1]).not.toBe(before[1]);
});

it('includes preset-driven action duration in the affected segment fingerprint', async () => {
  const project = { ...createEmptyVideoProject('Action segment'), duration: 4, fps: 10 };
  project.actionEvents = [
    {
      data: {},
      id: 'action-1',
      kind: VideoProjectActionEventKind.CLICK,
      label: 'Click',
      point: { x: 10, y: 20 },
      presentation: { preset: VideoProjectActionPreset.CLICK_RIPPLE },
      anchor: { kind: 'project', time: 1.8 },
    },
  ];
  const range = { endFrame: 20, startFrame: 0 };
  const before = await createVideoPreviewSegmentRevision(project, range);

  project.actionEvents = [{ ...project.actionEvents[0]!, point: { x: 30, y: 40 } }];

  await expect(createVideoPreviewSegmentRevision(project, range)).resolves.not.toBe(before);
});

it('includes an out-of-range action referenced by an active motion region', async () => {
  const project = { ...createEmptyVideoProject('Target action'), duration: 6, fps: 10 };
  project.actionEvents = [
    {
      data: {},
      id: 'action-1',
      kind: VideoProjectActionEventKind.CLICK,
      label: 'Target',
      point: { x: 100, y: 200 },
      presentation: { preset: VideoProjectActionPreset.CLICK_RIPPLE },
      anchor: { kind: 'project', time: 0.5 },
    },
  ];
  project.motionRegions = [
    {
      duration: 1,
      easing: VideoTemporalEasing.LINEAR,
      focusMode: VideoMotionFocusMode.ACTION,
      focusPoint: null,
      id: 'motion-1',
      scale: 2,
      startTime: 4,
      targetAction: { eventId: 'action-1', clipId: null },
      zoomInDuration: 0.2,
      zoomOutDuration: 0.2,
    },
  ];
  const range = { endFrame: 50, startFrame: 40 };
  const before = await createVideoPreviewSegmentRevision(project, range);

  project.actionEvents = [{ ...project.actionEvents[0]!, point: { x: 300, y: 400 } }];

  await expect(createVideoPreviewSegmentRevision(project, range)).resolves.not.toBe(before);
});

function createSourceRevisionProject() {
  const project = {
    ...createEmptyVideoProject('Source dependencies', 400, 200),
    duration: 6,
    fps: 10,
  };
  const asset = createVideoProjectAsset(
    'Source',
    'VIDEO',
    { kind: 'recording', recordingId: 'recording' },
    {
      width: 400,
      height: 200,
      duration: 6,
      mimeType: 'video/mp4',
      size: 10,
      hasAudio: false,
      audioPeaks: null,
    }
  );
  const clip = createVideoClipFromAsset(project.tracks[0]!.id, asset, 400, 200, 0);
  if (clip.type !== 'VIDEO') throw new Error('Expected source video');
  clip.sourceInstanceId = 'instance';
  project.assets = [asset];
  const first = { ...clip, id: 'first', duration: 2, sourceDuration: 2 };
  const next = {
    ...clip,
    id: 'next',
    startTime: 2,
    duration: 2,
    sourceStart: 2,
    sourceDuration: 2,
  };
  project.clips = [first, next];
  project.actionEvents = [1.9, 2.1].map((sourceTime, index) => ({
    id: `fact-${index}`,
    kind: 'CLICK' as const,
    label: 'Click',
    data: {},
    point: { x: 0.5, y: 0.5 },
    anchor: {
      kind: 'recording-source' as const,
      recordingId: 'recording',
      sourceInstanceId: 'instance',
      sourceEventId: `raw-${index}`,
      sourceTime,
    },
    presentation: { duration: 0.05 },
  }));
  return { project, first, next };
}

it('tracks out-of-window run topology affecting suppression without hashing unrelated neighbour visuals', async () => {
  const { project, first } = createSourceRevisionProject();
  const range = { startFrame: 20, endFrame: 30 };
  const before = await createVideoPreviewSegmentRevision(project, range);
  first.transform = { ...first.transform, x: 70 };
  await expect(createVideoPreviewSegmentRevision(project, range)).resolves.toBe(before);
  first.duration = 1.8;
  first.sourceDuration = 1.8;
  await expect(createVideoPreviewSegmentRevision(project, range)).resolves.not.toBe(before);
});

it('tracks an off-window target occurrence geometry without including another unrelated clip', async () => {
  const { project, first, next } = createSourceRevisionProject();
  project.motionRegions = [
    {
      duration: 1,
      startTime: 4,
      easing: 'LINEAR',
      focusMode: 'ACTION',
      focusPoint: { x: 200, y: 100 },
      id: 'focus',
      scale: 2,
      zoomInDuration: 0,
      zoomOutDuration: 0,
      targetAction: { eventId: 'fact-0', clipId: first.id },
    },
  ];
  const range = { startFrame: 40, endFrame: 50 };
  const before = await createVideoPreviewSegmentRevision(project, range);
  next.transform = { ...next.transform, x: 50 };
  await expect(createVideoPreviewSegmentRevision(project, range)).resolves.toBe(before);
  first.transform = { ...first.transform, x: 60 };
  await expect(createVideoPreviewSegmentRevision(project, range)).resolves.not.toBe(before);
});

it('invalidates a segment when an external source placement changes global caption packing', async () => {
  const project = { ...createEmptyVideoProject('Caption dependency'), duration: 10, fps: 10 };
  const asset = createVideoProjectAsset(
    'Source',
    'VIDEO',
    { kind: 'project-asset', projectAssetId: 'caption-source' },
    {
      duration: 1,
      width: 1920,
      height: 1080,
      mimeType: 'video/mp4',
      hasAudio: false,
      audioPeaks: null,
      size: 100,
    }
  );
  const clip = createVideoClipFromAsset(project.tracks[0]!.id, asset, 1920, 1080, 0);
  const fragment = {
    id: 'text',
    text: 'Caption',
    originalText: 'Caption',
    start: 0,
    end: 1,
    timeDomain: 'source' as const,
    alignment: 'manual' as const,
    revision: 0,
    timingRevision: 0,
    showInVideo: true,
  };
  const authored: typeof project = {
    ...project,
    assets: [asset],
    clips: [clip],
    textDocuments: [
      {
        id: 'source',
        binding: { kind: 'source' as const, assetId: asset.id, sourceInstanceId: clip.id },
        captions: {
          enabled: true,
          style: {
            position: 'bottom' as const,
            fontSize: 0.04,
            color: '#ffffff',
            background: '#000000',
          },
        },
        document: { version: 1 as const, fragments: [fragment] },
      },
    ],
  };
  authored.textDocuments!.push({
    ...authored.textDocuments![0]!,
    id: 'manual',
    binding: { kind: 'project' },
    document: {
      version: 1,
      fragments: [{ ...fragment, timeDomain: 'result', start: 0.5, end: 5 }],
    },
  });
  const moved = { ...authored, clips: [{ ...clip, startTime: 2 }] };
  const captionY = (candidate: typeof authored) =>
    planReviewCaptions({
      ...videoProjectCaptionInput(candidate),
      output: { width: 1920, height: 1080 },
      measure: () => 100,
    }).cues.find((cue) => cue.fragmentId === JSON.stringify(['manual', 'text']))!.y;
  expect(captionY(moved)).not.toBe(captionY(authored));
  const range = { startFrame: 40, endFrame: 60 };
  const before = await createVideoPreviewSegmentRevision(authored, range);
  await expect(createVideoPreviewSegmentRevision(moved, range)).resolves.not.toBe(before);
});

it('invalidates a cached segment when source slip preserves the phrase range but removes a word block', async () => {
  const project = { ...createEmptyVideoProject('Word slip', 240, 360), duration: 6, fps: 10 };
  const asset = createVideoProjectAsset(
    'Source',
    'VIDEO',
    { kind: 'project-asset', projectAssetId: 'word-source' },
    {
      duration: 4,
      width: 240,
      height: 360,
      mimeType: 'video/mp4',
      hasAudio: false,
      audioPeaks: null,
      size: 100,
    }
  );
  const clip = createVideoClipFromAsset(project.tracks[0]!.id, asset, 240, 360, 0);
  if (clip.type !== 'VIDEO') throw new Error('Expected video clip');
  const words = [
    { text: 'a'.repeat(60), start: 0, end: 0.2 },
    { text: 'b'.repeat(60), start: 3, end: 3.2 },
    { text: 'c'.repeat(60), start: 3.5, end: 4 },
  ];
  project.assets = [asset];
  project.clips = [{ ...clip, duration: 2, sourceDuration: 2 }];
  const captions = {
    enabled: true,
    style: { position: 'bottom' as const, fontSize: 0.04, color: '#ffffff', background: '#000000' },
  };
  const fragment = {
    id: 'text',
    text: words.map((word) => word.text).join(' '),
    originalText: '',
    start: 0,
    end: 4,
    timeDomain: 'source' as const,
    alignment: 'word' as const,
    revision: 0,
    timingRevision: 0,
    showInVideo: true,
    words,
  };
  project.textDocuments = [
    {
      id: 'source',
      binding: { kind: 'source', assetId: asset.id, sourceInstanceId: clip.id },
      captions,
      document: { version: 1, fragments: [fragment] },
    },
    {
      id: 'manual',
      binding: { kind: 'project' },
      captions,
      document: {
        version: 1,
        fragments: [
          {
            ...fragment,
            text: 'Manual',
            alignment: 'manual',
            timeDomain: 'result',
            start: 0.1,
            end: 5,
            words: [],
          },
        ],
      },
    },
  ];
  const slipped = {
    ...project,
    clips: [{ ...clip, duration: 2, sourceDuration: 2, sourceStart: 1 }],
  };
  const input = videoProjectCaptionInput(project);
  const changed = videoProjectCaptionInput(slipped);
  expect(input.project(input.document.fragments[0]!).ranges).toEqual(
    changed.project(changed.document.fragments[0]!).ranges
  );
  const plan = (candidate: typeof project) =>
    planReviewCaptions({
      ...videoProjectCaptionInput(candidate),
      output: { width: 240, height: 360 },
      measure: (text) => text.length * 6,
    });
  const initial = plan(project);
  const after = plan(slipped);
  expect(
    initial.cues.find((cue) => cue.fragmentId === JSON.stringify(['source', 'text']))
  ).toBeDefined();
  expect(
    after.cues.find((cue) => cue.fragmentId === JSON.stringify(['source', 'text']))
  ).toBeUndefined();
  const manualY = (value: typeof initial) =>
    value.cues.find((cue) => cue.fragmentId === JSON.stringify(['manual', 'text']))!.y;
  expect(manualY(after)).not.toBe(manualY(initial));
  const range = { startFrame: 40, endFrame: 60 };
  await expect(createVideoPreviewSegmentRevision(slipped, range)).resolves.not.toBe(
    await createVideoPreviewSegmentRevision(project, range)
  );
});

it('invalidates exact frames and every segment for authored final-canvas watermark changes', async () => {
  const project = { ...createEmptyVideoProject(), duration: 4 };
  const before = await createVideoPreviewRenderRevision(project);
  const segment = await createVideoPreviewSegmentRevision(project, { startFrame: 0, endFrame: 20 });
  project.watermark = { ...createQuickEditWatermark('Mark'), mode: 'text' };
  expect(await createVideoPreviewRenderRevision(project)).not.toBe(before);
  expect(
    await createVideoPreviewSegmentRevision(project, { startFrame: 0, endFrame: 20 })
  ).not.toBe(segment);
});
