import {
  createVideoProjectFromRecording,
  createVideoProjectTrack,
} from '../../../../../features/video/project/factories/creation';
import { isExportReadyVideoProject } from '../../../../../features/video/project/validation/root';
import { expect, it } from 'vitest';
import {
  VideoSubtitleSidecarFormat,
  VideoTrackKind,
  type VideoProject,
  type VideoProjectClip,
  type VideoProjectExportSettings,
  type VideoProjectTrack,
} from '../../../../../features/video/project/types';
import { buildSubtitleSidecarFiles } from './subtitle-sidecar';

function createSubtitleTrack(id: string, visible: boolean): VideoProjectTrack {
  const track = {
    id,
    kind: VideoTrackKind.SUBTITLE,
    name: visible ? 'Visible' : 'Hidden',
    order: visible ? 0 : 1,
    visible,
    locked: false,
    isRoot: false,
  } satisfies VideoProjectTrack;

  return track;
}

function createSubtitleClip(trackId: string, id: string, text: string): VideoProjectClip {
  const clip = {
    id,
    trackId,
    type: 'SUBTITLE',
    name: `Subtitle ${id}`,
    groupId: null,
    linkMode: 'DETACHED',
    startTime: id === 'clip-1' ? 0.5 : 1,
    duration: id === 'clip-1' ? 4 : 2,
    muted: true,
    volume: 1,
    volumeEnvelopeStart: 1,
    volumeEnvelopeEnd: 1,
    fadeInMs: 0,
    fadeOutMs: 0,
    transitionIn: 'NONE',
    transitionOut: 'NONE',
    transform: { x: 0, y: 0, width: 100, height: 40, rotation: 0, opacity: 1 },
    text,
  } satisfies VideoProjectClip;

  return clip;
}

function createProject(): VideoProject {
  const project = {
    version: 2,
    id: 'project-1',
    name: 'Subtitles',
    source: { kind: 'manual' },
    baseRecordingId: null,
    width: 1280,
    height: 720,
    fps: 30,
    backgroundColor: '#000000',
    timelinePlacementMode: 'ALLOW_OVERLAP',
    duration: 6,
    createdAt: 1,
    updatedAt: 1,
    assets: [],
    tracks: [
      createSubtitleTrack('subtitle-visible', true),
      createSubtitleTrack('subtitle-hidden', false),
    ],
    clips: [
      createSubtitleClip('subtitle-visible', 'clip-1', '  Привет, мир  '),
      createSubtitleClip('subtitle-hidden', 'clip-2', 'Скрытый'),
    ],
    cursorTrack: null,
    actionEvents: [],
  } satisfies VideoProject;

  return project;
}

function createSettings(
  overrides: Partial<VideoProjectExportSettings> = {}
): VideoProjectExportSettings {
  const settings = {
    width: 1280,
    height: 720,
    fps: 30,
    quality: 'HIGH',
    format: 'MP4',
    resolution: 'SOURCE' as const,
    mp4VideoCodec: 'AVC' as const,
    downloadAfterExport: true,
    ...overrides,
  } as VideoProjectExportSettings;

  return settings;
}

it('builds clipped SRT and VTT subtitle sidecars for the visible export range', async () => {
  const files = buildSubtitleSidecarFiles(
    createProject(),
    createSettings({
      rangeEndSeconds: 3,
      rangeStartSeconds: 1,
      subtitleSidecarFormats: [
        VideoSubtitleSidecarFormat.SRT,
        VideoSubtitleSidecarFormat.VTT,
        VideoSubtitleSidecarFormat.SRT,
      ],
    }),
    'demo.mp4'
  );

  expect(files.map((file) => file.filename)).toEqual(['demo.srt', 'demo.vtt']);
  await expect(files[0]?.blob.text()).resolves.toContain(
    '00:00:00,000 --> 00:00:02,000\nПривет, мир'
  );
  await expect(files[1]?.blob.text()).resolves.toContain(
    'WEBVTT\n\n1\n00:00:00.000 --> 00:00:02.000\nПривет, мир'
  );
});

it('returns no sidecars when no formats are enabled or no visible subtitle cues overlap', () => {
  expect(buildSubtitleSidecarFiles(createProject(), createSettings(), 'demo.mp4')).toEqual([]);
  expect(
    buildSubtitleSidecarFiles(
      createProject(),
      createSettings({
        rangeEndSeconds: 0.2,
        rangeStartSeconds: 0,
        subtitleSidecarFormats: [VideoSubtitleSidecarFormat.SRT],
      }),
      'demo.mp4'
    )
  ).toEqual([]);
});

it('includes authored documents with legacy tracks and rebases their project clock', async () => {
  const project = createProject();
  project.version = 5;
  project.textDocuments = [
    {
      id: 'authored',
      binding: { kind: 'project' },
      document: {
        version: 1,
        fragments: [
          {
            id: 'clip-1',
            start: 2,
            end: 4,
            text: 'Authored',
            originalText: '',
            revision: 0,
            timingRevision: 0,
            alignment: 'manual',
            timeDomain: 'result',
            showInVideo: true,
          },
        ],
      },
    },
  ];
  const files = buildSubtitleSidecarFiles(
    project,
    createSettings({
      rangeStartSeconds: 1,
      rangeEndSeconds: 3,
      subtitleSidecarFormats: [VideoSubtitleSidecarFormat.SRT],
    }),
    'demo.mp4'
  );
  const text = await files[0]?.blob.text();
  expect(text).toContain('00:00:00,000 --> 00:00:02,000\nПривет, мир');
  expect(text).toContain('00:00:01,000 --> 00:00:02,000\nAuthored');
  expect(text).not.toContain('Скрытый');
});

it('preserves valid sidecars when a frame-aligned export range leaves an unrepresentable tail', async () => {
  const project = createVideoProjectFromRecording({
    recordingId: 'source',
    filename: 'clip.webm',
    width: 640,
    height: 360,
    duration: 10,
    mimeType: 'video/webm',
    size: 100,
  });
  const track = createVideoProjectTrack(
    'Subtitles',
    project.tracks.length,
    VideoTrackKind.SUBTITLE
  );
  project.tracks.push(track);
  project.clips.push(
    { ...createSubtitleClip(track.id, 'clip-1', 'Tail'), startTime: 0.5, duration: 0.534 },
    { ...createSubtitleClip(track.id, 'clip-2', 'Retained'), startTime: 2, duration: 0.5 }
  );
  expect(isExportReadyVideoProject(project)).toBe(true);
  const before = structuredClone(project);
  const files = buildSubtitleSidecarFiles(
    project,
    createSettings({
      rangeStartSeconds: 31 / 30,
      rangeEndSeconds: 3,
      subtitleSidecarFormats: [VideoSubtitleSidecarFormat.SRT, VideoSubtitleSidecarFormat.VTT],
    }),
    'demo.mp4'
  );
  expect(files).toHaveLength(2);
  for (const file of files) {
    const text = await file.blob.text();
    expect(text).toContain('Retained');
    expect(text).not.toContain('Tail');
    expect(text).toMatch(/00:00:00[,.]967 --> 00:00:01[,.]466/);
  }
  expect(project).toEqual(before);
});
