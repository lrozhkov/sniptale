import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import {
  VideoOutputCodec,
  VideoOutputContainer,
  VideoResolutionPreset,
} from '@sniptale/runtime-contracts/video/types/types';
import { VideoRecordingQualitySummary } from './quality-summary';

it('shows the complete compact output profile without a duplicate native hint', () => {
  const markup = renderToStaticMarkup(
    <VideoRecordingQualitySummary
      profile={{
        ...DEFAULT_VIDEO_SETTINGS.outputProfile,
        container: VideoOutputContainer.MP4,
        codec: VideoOutputCodec.AVC,
        resolution: VideoResolutionPreset.P1080,
        frameRate: 30,
      }}
    />
  );
  expect(markup).toContain('MP4 · H.264 (AVC) · 1080p · 30 fps ·');
  expect(markup).not.toContain('title=');
});

it('does not invent a quality profile for older or recovered unknown state', () => {
  expect(renderToStaticMarkup(<VideoRecordingQualitySummary />)).toBe('');
  expect(renderToStaticMarkup(<VideoRecordingQualitySummary profile={null} />)).toBe('');
});
