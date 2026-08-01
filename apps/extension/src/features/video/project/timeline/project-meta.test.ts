import { describe, expect, it, vi } from 'vitest';
import { buildClipLabel, getDefaultExportSettings, normalizeTrackOrder } from './meta';
import {
  VideoExportFormat,
  VideoExportQualityPreset,
  VideoProjectShapeType,
  VideoTrackKind,
} from '../types/index';
import {
  createAudioClip,
  createProject,
  createShapeClip,
  createTextClip,
  createTrack,
  createVideoClip,
} from './project-meta.test.helpers.ts';

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

function expectDefaultExportSettings(project: ReturnType<typeof createProject>) {
  expect(getDefaultExportSettings(project)).toEqual({
    burnInSubtitles: false,
    downloadAfterExport: true,
    format: VideoExportFormat.MP4,
    mp4VideoCodec: 'AVC' as const,
    fps: 30,
    height: 720,
    quality: VideoExportQualityPreset.MEDIUM,
    resolution: '720P',
    scope: 'project',
    subtitleSidecarFormats: [],
    width: 1280,
  });
}

function expectNormalizedTrackOrder(project: ReturnType<typeof createProject>) {
  expect(normalizeTrackOrder(project)).toEqual({
    ...project,
    tracks: [
      expect.objectContaining({ id: 'track-a', order: 0 }),
      expect.objectContaining({ id: 'track-b', order: 1 }),
    ],
    updatedAt: 77,
  });
}

describe('video project meta defaults', () => {
  it('derives default export settings and normalizes track order', () => {
    vi.spyOn(Date, 'now').mockReturnValue(77);
    const project = createProject(
      [createVideoClip()],
      [createTrack('track-b', 5), createTrack('track-a', 2, VideoTrackKind.AUDIO)]
    );

    expectDefaultExportSettings(project);
    expectNormalizedTrackOrder(project);
  });

  it('builds translated text, shape, audio, and visual fallback labels', () => {
    const project = createProject([createVideoClip(), createAudioClip()]);

    expect(buildClipLabel(project, createTextClip({ text: ' '.repeat(4) }))).toBe(
      'shared.videoProject.defaultTextClipName'
    );
    expect(
      buildClipLabel(project, createShapeClip({ shapeType: VideoProjectShapeType.ELLIPSE }))
    ).toBe('shared.videoProject.defaultEllipseClipName');
    expect(
      buildClipLabel(project, createShapeClip({ shapeType: VideoProjectShapeType.LINE }))
    ).toBe('shared.videoProject.defaultLineClipName');
    expect(
      buildClipLabel(project, createShapeClip({ shapeType: VideoProjectShapeType.ARROW }))
    ).toBe('shared.videoProject.defaultArrowClipName');
    expect(buildClipLabel(project, createShapeClip())).toBe(
      'shared.videoProject.defaultRectangleClipName'
    );
    expect(
      buildClipLabel(
        project,
        createAudioClip({ assetId: 'missing-asset', name: undefined as unknown as string })
      )
    ).toBe('shared.videoProject.clipLabelAudioFallback');
    expect(
      buildClipLabel(
        createProject([createVideoClip()]),
        createVideoClip({ assetId: 'missing-asset', name: 'Visual fallback' })
      )
    ).toBe('Visual fallback');
  });
});
