import { expect, it } from 'vitest';

import {
  ProjectTimelineToolbarLeadingControls,
  ProjectTimelinePlaybackSummary,
  ProjectTimelineToolbarTrailingActions,
} from './sections';

it('re-exports the toolbar section entrypoints', () => {
  expect(ProjectTimelineToolbarLeadingControls).toBeTypeOf('function');
  expect(ProjectTimelinePlaybackSummary).toBeTypeOf('function');
  expect(ProjectTimelineToolbarTrailingActions).toBeTypeOf('function');
});
