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
import { createAnnotationClip } from '../factories/overlay-clip';

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

describe('video project meta defaults', () => {
  it('builds default export settings and normalizes track order', () => {
    vi.spyOn(Date, 'now').mockReturnValue(77);
    const project = createProject(
      [createVideoClip()],
      [createTrack('track-b', 5), createTrack('track-a', 2, VideoTrackKind.AUDIO)]
    );

    expect(getDefaultExportSettings(project)).toEqual({
      burnInSubtitles: false,
      downloadAfterExport: true,
      format: VideoExportFormat.MP4,
      fps: 30,
      height: 720,
      quality: VideoExportQualityPreset.BALANCED,
      scope: 'project',
      subtitleSidecarFormats: [],
      width: 1280,
    });
    expect(normalizeTrackOrder(project)).toEqual({
      ...project,
      tracks: [
        expect.objectContaining({ id: 'track-a', order: 0 }),
        expect.objectContaining({ id: 'track-b', order: 1 }),
      ],
      updatedAt: 77,
    });
  });
});

describe('video project meta clip labels', () => {
  it('builds text and shape labels with translated fallbacks', verifyTextAndShapeLabels);

  it('resolves audio and visual asset labels with fallbacks', () => {
    const project = createProject([createVideoClip(), createAudioClip()]);

    expect(
      buildClipLabel(
        project,
        createAudioClip({ assetId: 'asset-audio', name: undefined as unknown as string })
      )
    ).toBe('Audio asset');
    expect(
      buildClipLabel(
        createProject([createAudioClip()]),
        createAudioClip({ assetId: 'missing-asset', name: undefined as unknown as string })
      )
    ).toBe('shared.videoProject.clipLabelAudioFallback');
    expect(buildClipLabel(project, createVideoClip())).toBe('Video asset');
    expect(
      buildClipLabel(
        createProject([createVideoClip()]),
        createVideoClip({ assetId: 'missing-asset', name: 'Visual fallback' })
      )
    ).toBe('Visual fallback');
  });

  it('returns undefined for video clips without an asset name or clip fallback name', () => {
    expect(
      buildClipLabel(
        createProject([createVideoClip()]),
        createVideoClip({ assetId: 'missing-asset', name: undefined as unknown as string })
      )
    ).toBeUndefined();
  });
});

function verifyTextAndShapeLabels() {
  const project = createProject([createTextClip(), createShapeClip()]);
  const annotationClip = createAnnotationClip('track-video', 1280, 720, 0);
  const emptyAnnotationClip = createAnnotationClip('track-video', 1280, 720, 0);
  annotationClip.content = {
    badge: 'NEW',
    headline: '  Lower third headline  ',
    subline: 'Details',
  };
  emptyAnnotationClip.content = {
    badge: null,
    headline: '   ',
    subline: 'Details',
  };

  expect(buildClipLabel(project, createTextClip({ text: ' '.repeat(5) }))).toBe(
    'shared.videoProject.defaultTextClipName'
  );
  expect(
    buildClipLabel(
      project,
      createTextClip({ text: '  This is a very long text clip label that should be trimmed  ' })
    )
  ).toBe('This is a very long text clip label ');
  expect(
    buildClipLabel(project, createShapeClip({ shapeType: VideoProjectShapeType.ELLIPSE }))
  ).toBe('shared.videoProject.defaultEllipseClipName');
  expect(buildClipLabel(project, createShapeClip({ shapeType: VideoProjectShapeType.LINE }))).toBe(
    'shared.videoProject.defaultLineClipName'
  );
  expect(buildClipLabel(project, createShapeClip({ shapeType: VideoProjectShapeType.ARROW }))).toBe(
    'shared.videoProject.defaultArrowClipName'
  );
  expect(buildClipLabel(project, createShapeClip())).toBe(
    'shared.videoProject.defaultRectangleClipName'
  );
  expect(
    buildClipLabel(project, {
      ...createTextClip(),
      type: 'SUBTITLE',
      text: '  Subtitle label  ',
    } as never)
  ).toBe('Subtitle label');
  expect(buildClipLabel(project, annotationClip as never)).toBe('Lower third headline');
  expect(buildClipLabel(project, emptyAnnotationClip as never)).toBe(
    'shared.videoProject.defaultAnnotationClipName'
  );
}
