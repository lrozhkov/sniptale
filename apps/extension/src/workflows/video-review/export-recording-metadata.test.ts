import { expect, it } from 'vitest';
import { exportReviewedVideo } from './export-lifecycle';
import { createReviewExportFixture } from './export-lifecycle.test-support';

it.each(['native', 'missing', 'reexport'] as const)(
  'retains %s acquisition evidence in a separately published processed recording',
  async (mode) => {
    const { args, deps } = createReviewExportFixture();
    const recordingMetadata = {
      captureMode: 'SCREEN' as const,
      displaySurface: 'window' as const,
      actionCount: 0,
      hasPointer: false,
    };
    const loaded = await deps.loadVideoReviewSource();
    deps.loadVideoReviewSource.mockResolvedValueOnce({
      ...loaded,
      ...(mode === 'native'
        ? {
            telemetry: {
              recordingId: 'original',
              createdAt: 1,
              updatedAt: 1,
              captureMode: 'SCREEN',
              displaySurface: 'window',
              viewport: null,
              cursorTrack: null,
              actionEvents: [],
              signals: [],
            },
          }
        : mode === 'reexport'
          ? { recordingMetadata }
          : {}),
    });
    await exportReviewedVideo(args, deps);
    const publication = deps.saveRecordingsBatchSafely.mock.calls[0]![0]![0]!;
    expect(publication.recordingMetadata).toEqual(
      mode === 'missing' ? undefined : recordingMetadata
    );
    expect(publication.mediaMetadata).toEqual({
      kind: 'video',
      width: 160,
      height: 90,
      duration: 4,
    });
    expect(publication.id).not.toBe('original');
    expect(deps.saveRecordingsBatchSafely).toHaveBeenCalledOnce();
  }
);
