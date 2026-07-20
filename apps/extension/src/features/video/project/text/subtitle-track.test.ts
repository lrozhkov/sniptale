import { expect, it } from 'vitest';
import {
  getSubtitleTrackStyle,
  isSubtitleTrack,
  resolveSubtitleClipStyle,
  resolveSubtitleTrackTransform,
  resolveTextualClipStyle,
} from './subtitle-track';
import { VideoProjectClipType, VideoSubtitlePlacement, VideoTrackKind } from '../types/index';

it('normalizes subtitle track styles and recognizes subtitle tracks', () => {
  expect(
    getSubtitleTrackStyle({
      kind: VideoTrackKind.SUBTITLE,
      subtitleStyle: {
        maxWidthPercent: 140,
        padding: 24,
        safeAreaPercent: 0,
      },
    } as never)
  ).toMatchObject({
    maxWidthPercent: 100,
    padding: 24,
    safeAreaPercent: 1,
  });
  expect(isSubtitleTrack({ kind: VideoTrackKind.SUBTITLE } as never)).toBe(true);
  expect(isSubtitleTrack({ kind: VideoTrackKind.OVERLAY } as never)).toBe(false);
});

it('positions subtitle transforms by placement and safe area', () => {
  expect(
    resolveSubtitleTrackTransform({ height: 1080, width: 1920 } as never, {
      backgroundColor: '#000',
      borderColor: '#111',
      borderRadius: 20,
      borderWidth: 1,
      color: '#fff',
      fontFamily: 'Segoe UI',
      fontSize: 40,
      fontWeight: 700,
      lineHeight: 1.2,
      maxWidthPercent: 80,
      padding: 16,
      placement: VideoSubtitlePlacement.TOP,
      safeAreaPercent: 10,
      textAlign: 'center',
    })
  ).toMatchObject({
    width: 1536,
    x: 192,
    y: 108,
  });
  expect(
    resolveSubtitleTrackTransform({ height: 1080, width: 1920 } as never, {
      backgroundColor: '#000',
      borderColor: '#111',
      borderRadius: 20,
      borderWidth: 1,
      color: '#fff',
      fontFamily: 'Segoe UI',
      fontSize: 40,
      fontWeight: 700,
      lineHeight: 1.2,
      maxWidthPercent: 80,
      padding: 16,
      placement: VideoSubtitlePlacement.BOTTOM,
      safeAreaPercent: 10,
      textAlign: 'center',
    })
  ).toMatchObject({
    width: 1536,
    x: 192,
    y: 815,
  });
  expect(VideoProjectClipType.SUBTITLE).toBe('SUBTITLE');
});

it('resolves subtitle clip text styling from the owning subtitle track', () => {
  const project = {
    tracks: [
      {
        id: 'track-subtitle',
        kind: VideoTrackKind.SUBTITLE,
        subtitleStyle: {
          backgroundColor: '#000',
          borderColor: '#fff',
          borderRadius: 20,
          borderWidth: 1,
          color: '#fff',
          fontFamily: 'Segoe UI',
          fontSize: 38,
          fontWeight: 700,
          lineHeight: 1.2,
          maxWidthPercent: 76,
          padding: 14,
          placement: VideoSubtitlePlacement.BOTTOM,
          safeAreaPercent: 9,
          textAlign: 'center',
        },
      },
    ],
  };
  const clip = {
    id: 'subtitle-1',
    text: 'Caption',
    trackId: 'track-subtitle',
    type: VideoProjectClipType.SUBTITLE,
  } as never;

  expect(resolveSubtitleClipStyle(project as never, clip)).toMatchObject({
    fontSize: 38,
    maxWidthPercent: 76,
  });
  expect(resolveTextualClipStyle(project as never, clip)).toMatchObject({
    safeAreaPercent: 9,
  });
});

it('falls back for missing subtitle tracks and preserves regular text clip styles', () => {
  const project = { tracks: [] };
  const subtitleClip = {
    id: 'subtitle-missing-track',
    trackId: 'missing',
    type: VideoProjectClipType.SUBTITLE,
  } as never;
  const textStyle = { color: '#f00', fontSize: 18 };
  const textClip = {
    style: textStyle,
    type: VideoProjectClipType.TEXT,
  } as never;

  expect(resolveSubtitleClipStyle(project, subtitleClip)).toMatchObject({
    placement: VideoSubtitlePlacement.BOTTOM,
  });
  expect(resolveTextualClipStyle(project, textClip)).toEqual(textStyle);
});
