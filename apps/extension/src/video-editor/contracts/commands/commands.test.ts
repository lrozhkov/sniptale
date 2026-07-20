import { expectTypeOf, it } from 'vitest';

import type { VideoEditorAnnotationActions } from './annotation';
import type { VideoEditorExportActions } from './export';
import type { VideoEditorObjectTrackActions } from './object-tracks';
import type { VideoEditorActionEventPatch, VideoEditorMotionRegionPatch } from './patches';
import type { VideoEditorProjectActions } from './project';
import type { VideoEditorSessionActions } from './session';
import type { VideoEditorTemporalActions } from './temporal';
import type { VideoEditorMoveClipAction } from './timeline';
import type { VideoEditorEffectInstanceActions } from './effect-instance';

it('composes leaf command contracts without a Zustand state dependency', () => {
  expectTypeOf<VideoEditorProjectActions>().toMatchTypeOf<VideoEditorAnnotationActions>();
  expectTypeOf<VideoEditorProjectActions>().toMatchTypeOf<VideoEditorObjectTrackActions>();
  expectTypeOf<VideoEditorProjectActions>().toMatchTypeOf<VideoEditorTemporalActions>();
  expectTypeOf<VideoEditorProjectActions>().toMatchTypeOf<VideoEditorEffectInstanceActions>();
  expectTypeOf<VideoEditorProjectActions['moveClip']>().toEqualTypeOf<VideoEditorMoveClipAction>();
  expectTypeOf<VideoEditorProjectActions['updateActionEventDetails']>()
    .parameter(1)
    .toEqualTypeOf<VideoEditorActionEventPatch>();
  expectTypeOf<VideoEditorProjectActions['updateMotionRegion']>()
    .parameter(1)
    .toEqualTypeOf<VideoEditorMotionRegionPatch>();
  expectTypeOf<VideoEditorSessionActions['setError']>().parameters.toEqualTypeOf<[string | null]>();
  expectTypeOf<VideoEditorExportActions['cancelExport']>().returns.toEqualTypeOf<void>();
});
