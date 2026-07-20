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
    downloadAfterExport: true,
    ...overrides,
  } satisfies VideoProjectExportSettings;

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
    'WEBVTT\n\n00:00:00.000 --> 00:00:02.000\nПривет, мир'
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
